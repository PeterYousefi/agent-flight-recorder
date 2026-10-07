import { describe, expect, it } from 'vitest'

import {
  CURRENT_EVENT_SCHEMA_VERSION,
  DomainErrorCode,
  ExecutionEventType,
  InvalidEventError,
  InvalidEventSequenceError,
  InvalidEventStreamError,
  UnsupportedEventSchemaError,
  createExecutionEvent,
  isFinalExecutionEvent,
  validateExecutionEventStream,
  type ExecutionEvent,
} from './index.js'

const executionId = 'execution-1'
const timestamp = '2026-10-07T12:00:00.000Z'
const budgetPolicy = {
  maxCostUsd: 1,
  maxDurationSeconds: 60,
  maxAttempts: 3,
  maxToolCalls: 10,
}

function createEvent(
  eventType: ExecutionEventType,
  sequence: number,
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): ExecutionEvent {
  return createExecutionEvent({
    eventId: `event-${sequence}`,
    eventType,
    executionId,
    timestamp,
    sequence,
    payload,
    ...overrides,
  }) as ExecutionEvent
}

const payloads: Readonly<Record<ExecutionEventType, Record<string, unknown>>> = {
  [ExecutionEventType.EXECUTION_CREATED]: {
    agentId: 'agent-1',
    provider: 'mock',
    operation: 'run',
    budgetPolicy,
  },
  [ExecutionEventType.EXECUTION_QUEUED]: { queueName: 'executions' },
  [ExecutionEventType.EXECUTION_STARTED]: { attemptNumber: 1 },
  [ExecutionEventType.EXECUTION_WAITING]: {
    reason: 'waiting for tool',
    dependencyType: 'tool',
  },
  [ExecutionEventType.EXECUTION_RETRY_SCHEDULED]: {
    attemptNumber: 1,
    reason: 'transient dependency failure',
    retryable: true,
    nextRetryAt: timestamp,
  },
  [ExecutionEventType.EXECUTION_SUCCEEDED]: { attemptNumber: 1 },
  [ExecutionEventType.EXECUTION_FAILED]: {
    attemptNumber: 1,
    error: { code: 'PROVIDER_TIMEOUT', message: 'Provider timed out', retryable: true },
  },
  [ExecutionEventType.EXECUTION_CANCELLED]: { reason: 'operator requested cancellation' },
  [ExecutionEventType.EXECUTION_BUDGET_EXCEEDED]: {
    budgetType: 'cost',
    limit: 1,
    observed: 1.1,
  },
  [ExecutionEventType.EXECUTION_DEAD_LETTERED]: {
    reason: 'retry limit exhausted',
    attemptNumber: 3,
  },
  [ExecutionEventType.EXECUTION_REPLAYED]: {
    originalExecutionId: 'original-1',
    replayExecutionId: executionId,
    replayMode: 'simulation',
  },
  [ExecutionEventType.TOOL_REQUESTED]: {
    toolName: 'search',
    toolInvocationId: 'tool-1',
    attemptNumber: 1,
  },
  [ExecutionEventType.TOOL_STARTED]: {
    toolName: 'search',
    toolInvocationId: 'tool-1',
    attemptNumber: 1,
  },
  [ExecutionEventType.TOOL_SUCCEEDED]: {
    toolInvocationId: 'tool-1',
    durationMs: 20,
  },
  [ExecutionEventType.TOOL_FAILED]: {
    toolInvocationId: 'tool-1',
    durationMs: 20,
    error: { code: 'TOOL_TIMEOUT', message: 'Tool timed out', retryable: true },
  },
  [ExecutionEventType.ARTIFACT_PERSISTED]: {
    artifactReference: 'blob://artifact-1',
    artifactType: 'tool-output',
    sizeBytes: 42,
  },
  [ExecutionEventType.BUDGET_WARNING]: {
    budgetType: 'cost',
    threshold: 0.8,
    observed: 0.8,
  },
}

describe('execution events', () => {
  it('constructs every supported event type with a schema version', () => {
    for (const [index, eventType] of Object.values(ExecutionEventType).entries()) {
      const event = createEvent(eventType, index + 1, payloads[eventType])
      expect(event.eventType).toBe(eventType)
      expect(event.schemaVersion).toBe(CURRENT_EVENT_SCHEMA_VERSION)
      expect(event.sequence).toBe(index + 1)
    }
  })

  it('accepts correlation metadata and rejects empty identifiers', () => {
    const event = createEvent(
      ExecutionEventType.EXECUTION_CREATED,
      1,
      payloads[ExecutionEventType.EXECUTION_CREATED],
      { correlation: { correlationId: 'request-1', traceId: 'trace-1' } },
    )
    expect(event.correlation?.traceId).toBe('trace-1')
    expect(() =>
      createEvent(
        ExecutionEventType.EXECUTION_CREATED,
        1,
        payloads[ExecutionEventType.EXECUTION_CREATED],
        { correlation: { traceId: '' } },
      ),
    ).toThrow(InvalidEventError)
  })

  it('rejects unsupported schema versions', () => {
    expect(() =>
      createEvent(
        ExecutionEventType.EXECUTION_CREATED,
        1,
        payloads[ExecutionEventType.EXECUTION_CREATED],
        { schemaVersion: 2 },
      ),
    ).toThrow(UnsupportedEventSchemaError)
  })

  it.each([
    ['eventId', ''],
    ['executionId', ''],
    ['timestamp', 'not-a-timestamp'],
    ['sequence', 0],
    ['sequence', -1],
    ['sequence', 1.5],
  ] as const)('rejects invalid %s values', (field, value) => {
    expect(() =>
      createEvent(
        ExecutionEventType.EXECUTION_CREATED,
        1,
        payloads[ExecutionEventType.EXECUTION_CREATED],
        { [field]: value },
      ),
    ).toThrow(field === 'sequence' ? InvalidEventSequenceError : InvalidEventError)
  })

  it('validates event-specific payloads and normalized errors', () => {
    expect(() => createEvent(ExecutionEventType.TOOL_STARTED, 1, { toolName: 'search' })).toThrow(
      InvalidEventError,
    )
    expect(() =>
      createEvent(ExecutionEventType.EXECUTION_FAILED, 1, {
        attemptNumber: 1,
        error: new Error('raw exception'),
      }),
    ).toThrow(InvalidEventError)
    expect(() =>
      createEvent(ExecutionEventType.EXECUTION_SUCCEEDED, 1, {
        attemptNumber: 1,
        measuredCostUsd: -0.1,
      }),
    ).toThrow(InvalidEventError)
  })

  it('creates immutable JSON-serializable historical facts', () => {
    const event = createEvent(
      ExecutionEventType.EXECUTION_CREATED,
      1,
      payloads[ExecutionEventType.EXECUTION_CREATED],
    )
    expect(Object.isFrozen(event)).toBe(true)
    expect(Object.isFrozen(event.payload)).toBe(true)
    expect(JSON.parse(JSON.stringify(event))).toEqual(event)
  })

  it('exposes the event validation error codes through the existing hierarchy', () => {
    expect(() =>
      createEvent(
        ExecutionEventType.EXECUTION_CREATED,
        0,
        payloads[ExecutionEventType.EXECUTION_CREATED],
      ),
    ).toThrow(expect.objectContaining({ code: DomainErrorCode.INVALID_EVENT_SEQUENCE }))
  })
})

describe('execution event streams', () => {
  function stream(...events: ExecutionEvent[]): readonly ExecutionEvent[] {
    return validateExecutionEventStream(events)
  }

  it('accepts a valid created, failed, dead-lettered stream', () => {
    const events = [
      createEvent(
        ExecutionEventType.EXECUTION_CREATED,
        1,
        payloads[ExecutionEventType.EXECUTION_CREATED],
      ),
      createEvent(
        ExecutionEventType.EXECUTION_FAILED,
        2,
        payloads[ExecutionEventType.EXECUTION_FAILED],
      ),
      createEvent(
        ExecutionEventType.EXECUTION_DEAD_LETTERED,
        3,
        payloads[ExecutionEventType.EXECUTION_DEAD_LETTERED],
      ),
    ]
    expect(stream(...events)).toEqual(events)
    expect(isFinalExecutionEvent(events[2])).toBe(true)
  })

  it('closes the original lifecycle stream after a final terminal event', () => {
    const terminal = createEvent(
      ExecutionEventType.EXECUTION_SUCCEEDED,
      2,
      payloads[ExecutionEventType.EXECUTION_SUCCEEDED],
    )
    const replayed = createEvent(
      ExecutionEventType.EXECUTION_REPLAYED,
      3,
      payloads[ExecutionEventType.EXECUTION_REPLAYED],
    )
    expect(replayed.payload.originalExecutionId).not.toBe(executionId)
    expect(() =>
      stream(
        createEvent(
          ExecutionEventType.EXECUTION_CREATED,
          1,
          payloads[ExecutionEventType.EXECUTION_CREATED],
        ),
        terminal,
        replayed,
      ),
    ).toThrow(InvalidEventStreamError)
  })

  it.each([
    [
      'mismatched execution ids',
      [
        createEvent(
          ExecutionEventType.EXECUTION_CREATED,
          1,
          payloads[ExecutionEventType.EXECUTION_CREATED],
        ),
        createEvent(
          ExecutionEventType.EXECUTION_STARTED,
          2,
          payloads[ExecutionEventType.EXECUTION_STARTED],
          { executionId: 'other' },
        ),
      ],
    ],
    [
      'duplicate sequences',
      [
        createEvent(
          ExecutionEventType.EXECUTION_CREATED,
          1,
          payloads[ExecutionEventType.EXECUTION_CREATED],
        ),
        createEvent(
          ExecutionEventType.EXECUTION_STARTED,
          1,
          payloads[ExecutionEventType.EXECUTION_STARTED],
        ),
      ],
    ],
    [
      'out of order sequences',
      [
        createEvent(
          ExecutionEventType.EXECUTION_CREATED,
          1,
          payloads[ExecutionEventType.EXECUTION_CREATED],
        ),
        createEvent(
          ExecutionEventType.EXECUTION_STARTED,
          3,
          payloads[ExecutionEventType.EXECUTION_STARTED],
        ),
      ],
    ],
    [
      'missing created event',
      [
        createEvent(
          ExecutionEventType.EXECUTION_STARTED,
          1,
          payloads[ExecutionEventType.EXECUTION_STARTED],
        ),
      ],
    ],
    [
      'event after final terminal event',
      [
        createEvent(
          ExecutionEventType.EXECUTION_CREATED,
          1,
          payloads[ExecutionEventType.EXECUTION_CREATED],
        ),
        createEvent(
          ExecutionEventType.EXECUTION_SUCCEEDED,
          2,
          payloads[ExecutionEventType.EXECUTION_SUCCEEDED],
        ),
        createEvent(
          ExecutionEventType.EXECUTION_STARTED,
          3,
          payloads[ExecutionEventType.EXECUTION_STARTED],
        ),
      ],
    ],
  ] as const)('rejects %s', (_description, events) => {
    expect(() => stream(...events)).toThrow(expect.objectContaining({ code: expect.any(String) }))
  })

  it('rejects backwards timestamps and empty streams', () => {
    const created = createEvent(
      ExecutionEventType.EXECUTION_CREATED,
      1,
      payloads[ExecutionEventType.EXECUTION_CREATED],
    )
    const earlier = createEvent(
      ExecutionEventType.EXECUTION_STARTED,
      2,
      payloads[ExecutionEventType.EXECUTION_STARTED],
      {
        timestamp: '2026-10-06T12:00:00.000Z',
      },
    )
    expect(() => stream(created, earlier)).toThrow(InvalidEventStreamError)
    expect(() => validateExecutionEventStream([])).toThrow(InvalidEventStreamError)
  })
})

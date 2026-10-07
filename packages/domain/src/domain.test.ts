import { describe, expect, it } from 'vitest'

import {
  AttemptStatus,
  DomainErrorCode,
  ExecutionStatus,
  InvalidAttemptError,
  InvalidBudgetPolicyError,
  InvalidExecutionRequestError,
  InvalidStateTransitionError,
  ReplayMode,
  VALID_TRANSITIONS,
  canTransitionTo,
  createBudgetPolicy,
  createExecution,
  createExecutionAttempt,
  createExecutionRequest,
  createNonNegativeMoney,
  domainErrorCodeLabel,
  isTerminal,
  statusLabel,
  transition,
} from './index.js'

const validBudget = {
  maxCostUsd: 1,
  maxDurationSeconds: 60,
  maxAttempts: 3,
  maxToolCalls: 10,
}

const validRequest = {
  agentId: 'agent-1',
  provider: 'mock',
  operation: 'run',
  input: { prompt: 'hello' },
  budgetPolicy: validBudget,
}

describe('execution lifecycle', () => {
  it('allows every explicitly permitted transition', () => {
    for (const [from, destinations] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of destinations) {
        expect(canTransitionTo(from as ExecutionStatus, to)).toBe(true)
        expect(transition(from as ExecutionStatus, to)).toBe(to)
      }
    }
  })

  it.each([
    [ExecutionStatus.PENDING, ExecutionStatus.RUNNING],
    [ExecutionStatus.QUEUED, ExecutionStatus.SUCCEEDED],
    [ExecutionStatus.RUNNING, ExecutionStatus.QUEUED],
    [ExecutionStatus.RETRY_SCHEDULED, ExecutionStatus.RUNNING],
    [ExecutionStatus.SUCCEEDED, ExecutionStatus.RUNNING],
    [ExecutionStatus.FAILED, ExecutionStatus.PENDING],
    [ExecutionStatus.CANCELLED, ExecutionStatus.QUEUED],
    [ExecutionStatus.BUDGET_EXCEEDED, ExecutionStatus.RUNNING],
    [ExecutionStatus.DEAD_LETTERED, ExecutionStatus.PENDING],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(() => transition(from, to)).toThrow(InvalidStateTransitionError)
    expect(() => transition(from, to)).toThrow(
      expect.objectContaining({
        code: DomainErrorCode.INVALID_STATE_TRANSITION,
        from,
        to,
      }),
    )
  })

  it('keeps every terminal status from transitioning to an active status', () => {
    const activeStatuses = [
      ExecutionStatus.PENDING,
      ExecutionStatus.QUEUED,
      ExecutionStatus.RUNNING,
      ExecutionStatus.WAITING,
      ExecutionStatus.RETRY_SCHEDULED,
    ]
    const terminalStatuses = Object.values(ExecutionStatus).filter(isTerminal)

    expect(terminalStatuses).toEqual([
      ExecutionStatus.SUCCEEDED,
      ExecutionStatus.FAILED,
      ExecutionStatus.CANCELLED,
      ExecutionStatus.BUDGET_EXCEEDED,
      ExecutionStatus.DEAD_LETTERED,
    ])
    for (const terminalStatus of terminalStatuses) {
      for (const activeStatus of activeStatuses) {
        expect(canTransitionTo(terminalStatus, activeStatus)).toBe(false)
      }
    }
  })

  it('handles every status exhaustively', () => {
    for (const status of Object.values(ExecutionStatus)) {
      expect(statusLabel(status)).toBeTypeOf('string')
      expect(VALID_TRANSITIONS[status]).toBeDefined()
    }
  })
})

describe('execution requests and replay relationships', () => {
  it('creates an immutable validated request', () => {
    const request = createExecutionRequest(validRequest)

    expect(request.provider).toBe('mock')
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.input)).toBe(true)
  })

  it.each([
    undefined,
    null,
    {},
    { ...validRequest, agentId: '' },
    { ...validRequest, provider: 42 },
    { ...validRequest, input: [] },
    { ...validRequest, budgetPolicy: undefined },
    { ...validRequest, metadata: 'invalid' },
  ])('rejects malformed request %o', (request) => {
    expect(() => createExecutionRequest(request)).toThrow(InvalidExecutionRequestError)
  })

  it('models replay as a relationship on a new execution', () => {
    const request = createExecutionRequest(validRequest)
    const replay = createExecution('replay-1', request, new Date(0), {
      originalExecutionId: 'original-1',
      replayMode: ReplayMode.SIMULATION,
    })

    expect(replay.status).toBe(ExecutionStatus.PENDING)
    expect(replay.originalExecutionId).toBe('original-1')
    expect(replay.id).not.toBe(replay.originalExecutionId)
    expect(() =>
      createExecution('original-1', request, new Date(0), {
        originalExecutionId: 'original-1',
        replayMode: ReplayMode.INPUT,
      }),
    ).toThrow(InvalidExecutionRequestError)
  })
})

describe('budget policy and monetary values', () => {
  it('accepts valid policy boundaries and non-negative money', () => {
    expect(createBudgetPolicy(validBudget).maxCostUsd).toBe(1)
    expect(createNonNegativeMoney(0)).toEqual({ amountUsd: 0 })
    expect(createNonNegativeMoney(12.5)).toEqual({ amountUsd: 12.5 })
  })

  it.each([
    ['maxCostUsd', -1],
    ['maxCostUsd', Number.NaN],
    ['maxDurationSeconds', 0],
    ['maxDurationSeconds', -1],
    ['maxAttempts', 0],
    ['maxAttempts', 1.5],
    ['maxToolCalls', -1],
    ['maxToolCalls', 1.5],
  ] as const)('rejects invalid %s value %s', (field, value) => {
    expect(() => createBudgetPolicy({ ...validBudget, [field]: value })).toThrow(
      InvalidBudgetPolicyError,
    )
  })

  it('rejects invalid monetary values', () => {
    expect(() => createNonNegativeMoney(-0.01)).toThrow(InvalidBudgetPolicyError)
    expect(() => createNonNegativeMoney(Number.POSITIVE_INFINITY)).toThrow(InvalidBudgetPolicyError)
  })
})

describe('attempt values and typed errors', () => {
  it('creates a validated immutable attempt', () => {
    const startedAt = new Date('2026-01-01T00:00:00.000Z')
    const attempt = createExecutionAttempt({
      id: 'attempt-1',
      executionId: 'execution-1',
      attemptNumber: 1,
      status: AttemptStatus.RUNNING,
      startedAt,
    })

    expect(attempt.attemptNumber).toBe(1)
    expect(Object.isFrozen(attempt)).toBe(true)
  })

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid max-attempt-style attempt number %s',
    (attemptNumber) => {
      expect(() =>
        createExecutionAttempt({
          id: 'attempt-1',
          executionId: 'execution-1',
          attemptNumber,
          status: AttemptStatus.RUNNING,
          startedAt: new Date(),
        }),
      ).toThrow(InvalidAttemptError)
    },
  )

  it('exposes stable typed error codes', () => {
    const error = new InvalidStateTransitionError(
      ExecutionStatus.SUCCEEDED,
      ExecutionStatus.RUNNING,
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(DomainErrorCode.INVALID_STATE_TRANSITION)
    expect(error.name).toBe('InvalidStateTransitionError')
  })

  it('handles every domain error code exhaustively', () => {
    for (const code of Object.values(DomainErrorCode)) {
      expect(domainErrorCodeLabel(code)).toBeTypeOf('string')
    }
  })
})

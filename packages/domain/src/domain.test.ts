import { describe, expect, it } from 'vitest'

import {
  AttemptStatus,
  ACTIVE_STATES,
  BLOCKED_STATES,
  DomainErrorCode,
  ExecutionStatus,
  FAILED_STATES,
  InvalidAttemptError,
  InvalidBudgetPolicyError,
  InvalidExecutionRequestError,
  InvalidStateTransitionError,
  ReplayMode,
  VALID_TRANSITIONS,
  INITIAL_STATES,
  RETRY_STATES,
  TERMINAL_STATES,
  canTransitionTo,
  classifyStatus,
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
  const expectedTransitions: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
    [ExecutionStatus.PENDING]: [ExecutionStatus.QUEUED, ExecutionStatus.CANCELLED],
    [ExecutionStatus.QUEUED]: [ExecutionStatus.RUNNING, ExecutionStatus.CANCELLED],
    [ExecutionStatus.RUNNING]: [
      ExecutionStatus.WAITING,
      ExecutionStatus.RETRY_SCHEDULED,
      ExecutionStatus.SUCCEEDED,
      ExecutionStatus.FAILED,
      ExecutionStatus.CANCELLED,
      ExecutionStatus.BUDGET_EXCEEDED,
    ],
    [ExecutionStatus.WAITING]: [
      ExecutionStatus.RUNNING,
      ExecutionStatus.RETRY_SCHEDULED,
      ExecutionStatus.FAILED,
      ExecutionStatus.CANCELLED,
      ExecutionStatus.BUDGET_EXCEEDED,
    ],
    [ExecutionStatus.RETRY_SCHEDULED]: [ExecutionStatus.QUEUED, ExecutionStatus.CANCELLED],
    [ExecutionStatus.SUCCEEDED]: [],
    [ExecutionStatus.FAILED]: [ExecutionStatus.DEAD_LETTERED],
    [ExecutionStatus.CANCELLED]: [],
    [ExecutionStatus.BUDGET_EXCEEDED]: [],
    [ExecutionStatus.DEAD_LETTERED]: [],
  }

  it('matches the complete explicitly permitted transition matrix', () => {
    expect(VALID_TRANSITIONS).toEqual(expectedTransitions)
    for (const from of Object.values(ExecutionStatus)) {
      for (const to of Object.values(ExecutionStatus)) {
        const allowed = expectedTransitions[from].includes(to)
        expect(canTransitionTo(from, to)).toBe(allowed)
        if (allowed) {
          expect(transition(from, to)).toBe(to)
        }
      }
    }
  })

  it('rejects every transition outside the matrix with source and target details', () => {
    for (const from of Object.values(ExecutionStatus)) {
      for (const to of Object.values(ExecutionStatus)) {
        if (expectedTransitions[from].includes(to)) {
          continue
        }
        expect(() => transition(from, to)).toThrow(InvalidStateTransitionError)
        expect(() => transition(from, to)).toThrow(
          expect.objectContaining({
            code: DomainErrorCode.INVALID_STATE_TRANSITION,
            from,
            to,
          }),
        )
      }
    }
  })

  it('classifies every status exactly once', () => {
    const groups = [
      INITIAL_STATES,
      ACTIVE_STATES,
      BLOCKED_STATES,
      RETRY_STATES,
      FAILED_STATES,
      TERMINAL_STATES,
    ]
    const classifiedStatuses = groups.flat()

    expect(classifiedStatuses).toHaveLength(Object.values(ExecutionStatus).length)
    expect(new Set(classifiedStatuses).size).toBe(classifiedStatuses.length)
    for (const status of Object.values(ExecutionStatus)) {
      expect(classifiedStatuses).toContain(status)
      expect(classifyStatus(status)).toBeTypeOf('string')
    }
    expect(FAILED_STATES).toEqual([ExecutionStatus.FAILED])
  })

  it('allows cancellation from every non-terminal state and nowhere else', () => {
    for (const status of Object.values(ExecutionStatus)) {
      if (isTerminal(status) || status === ExecutionStatus.FAILED) {
        expect(canTransitionTo(status, ExecutionStatus.CANCELLED)).toBe(false)
      } else {
        expect(transition(status, ExecutionStatus.CANCELLED)).toBe(ExecutionStatus.CANCELLED)
      }
    }
  })

  it('supports waiting resume and retry paths without self-transitions', () => {
    expect(transition(ExecutionStatus.WAITING, ExecutionStatus.RUNNING)).toBe(
      ExecutionStatus.RUNNING,
    )
    expect(transition(ExecutionStatus.WAITING, ExecutionStatus.RETRY_SCHEDULED)).toBe(
      ExecutionStatus.RETRY_SCHEDULED,
    )
    expect(transition(ExecutionStatus.RETRY_SCHEDULED, ExecutionStatus.QUEUED)).toBe(
      ExecutionStatus.QUEUED,
    )
    for (const status of Object.values(ExecutionStatus)) {
      expect(canTransitionTo(status, status)).toBe(false)
      expect(statusLabel(status)).toBeTypeOf('string')
    }
  })

  it('preserves terminal-state invariants across every bounded valid path', () => {
    const visit = (status: ExecutionStatus, depth: number): void => {
      if (isTerminal(status)) {
        for (const next of Object.values(ExecutionStatus)) {
          expect(canTransitionTo(status, next)).toBe(false)
        }
        return
      }
      if (depth === 0) {
        return
      }
      for (const next of VALID_TRANSITIONS[status]) {
        expect(transition(status, next)).toBe(next)
        visit(next, depth - 1)
      }
    }

    for (const initialStatus of INITIAL_STATES) {
      visit(initialStatus, 8)
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

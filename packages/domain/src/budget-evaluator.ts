import { InvalidBudgetPolicyError } from './errors.js'
import type { BudgetPolicy } from './budget.js'

export const DEFAULT_BUDGET_WARNING_THRESHOLD = 0.8
const USD_MICROS_PER_DOLLAR = 1_000_000

// USD inputs remain ergonomic numbers at the boundary; comparisons use integer
// micro-dollars to avoid binary floating-point boundary drift.

export type BudgetDimension = 'cost' | 'duration' | 'attempts' | 'tool_calls'
export type BudgetExceededReason = 'limit_reached' | 'limit_exceeded'
export type BudgetObservationKind = 'warning' | 'violation'

export interface ExecutionUsage {
  readonly estimatedCostUsd: number
  readonly measuredCostUsd?: number
  readonly attempts: number
  readonly elapsedSeconds: number
  readonly toolCalls: number
}

export interface BudgetObservation {
  readonly kind: BudgetObservationKind
  readonly dimension: BudgetDimension
  readonly limit: number
  readonly usage: number
  readonly utilization: number
  readonly remaining: number
  readonly reason?: BudgetExceededReason
}

export interface BudgetEvaluation {
  readonly allowed: boolean
  readonly warnings: readonly BudgetObservation[]
  readonly violations: readonly BudgetObservation[]
}

export type BudgetDecision =
  | Readonly<{ kind: 'ALLOW' }>
  | Readonly<{ kind: 'WARN'; observation: BudgetObservation }>
  | Readonly<{ kind: 'DENY'; observation: BudgetObservation }>

export interface OperationCost {
  readonly estimatedAdditionalCostUsd: number
}

export function evaluateBudget(
  policy: BudgetPolicy,
  usage: ExecutionUsage,
  warningThreshold = DEFAULT_BUDGET_WARNING_THRESHOLD,
): BudgetEvaluation {
  validateWarningThreshold(warningThreshold)
  validateUsage(usage)

  const observations = [
    evaluateCost(policy.maxCostUsd, usage, warningThreshold),
    evaluateDimension(
      'duration',
      policy.maxDurationSeconds,
      usage.elapsedSeconds,
      warningThreshold,
      false,
    ),
    evaluateDimension('attempts', policy.maxAttempts, usage.attempts, warningThreshold, true),
    evaluateDimension('tool_calls', policy.maxToolCalls, usage.toolCalls, warningThreshold, true),
  ].filter((observation): observation is BudgetObservation => observation !== undefined)

  const warnings = observations.filter((observation) => observation.kind === 'warning')
  const violations = observations.filter((observation) => observation.kind === 'violation')

  return Object.freeze({
    allowed: violations.length === 0,
    warnings: Object.freeze(warnings),
    violations: Object.freeze(violations),
  })
}

export function canStartAttempt(policy: BudgetPolicy, usage: ExecutionUsage): BudgetDecision {
  validateUsage(usage)
  const limit = policy.maxAttempts
  if (limit === undefined) {
    return allowDecision()
  }
  return decisionForNextCount('attempts', limit, usage.attempts, DEFAULT_BUDGET_WARNING_THRESHOLD)
}

export function canStartToolCall(policy: BudgetPolicy, usage: ExecutionUsage): BudgetDecision {
  validateUsage(usage)
  const limit = policy.maxToolCalls
  if (limit === undefined) {
    return allowDecision()
  }
  return decisionForNextCount(
    'tool_calls',
    limit,
    usage.toolCalls,
    DEFAULT_BUDGET_WARNING_THRESHOLD,
  )
}

export function canSpend(
  policy: BudgetPolicy,
  usage: ExecutionUsage,
  operation: OperationCost,
): BudgetDecision {
  validateUsage(usage)
  validateNonNegativeFinite(operation.estimatedAdditionalCostUsd, 'estimatedAdditionalCostUsd')
  const limit = policy.maxCostUsd
  if (limit === undefined) {
    return allowDecision()
  }

  const currentMicros = toMicros(usage.measuredCostUsd ?? usage.estimatedCostUsd)
  const additionalMicros = toMicros(operation.estimatedAdditionalCostUsd)
  const limitMicros = toMicros(limit)
  const projectedMicros = currentMicros + additionalMicros
  if (projectedMicros > limitMicros) {
    return Object.freeze({
      kind: 'DENY',
      observation: createObservation(
        'cost',
        limit,
        fromMicros(projectedMicros),
        'violation',
        'limit_exceeded',
      ),
    })
  }
  if (projectedMicros === limitMicros) {
    return Object.freeze({
      kind: 'WARN',
      observation: createObservation('cost', limit, fromMicros(projectedMicros), 'warning'),
    })
  }
  return allowDecision()
}

export function canContinueDuration(
  policy: BudgetPolicy,
  usage: ExecutionUsage,
  expectedAdditionalSeconds = 0,
): BudgetDecision {
  validateUsage(usage)
  validateNonNegativeFinite(expectedAdditionalSeconds, 'expectedAdditionalSeconds')
  const limit = policy.maxDurationSeconds
  if (limit === undefined) {
    return allowDecision()
  }
  const projected = usage.elapsedSeconds + expectedAdditionalSeconds
  if (projected > limit) {
    return Object.freeze({
      kind: 'DENY',
      observation: createObservation('duration', limit, projected, 'violation', 'limit_exceeded'),
    })
  }
  if (projected >= limit * DEFAULT_BUDGET_WARNING_THRESHOLD) {
    return Object.freeze({
      kind: 'WARN',
      observation: createObservation('duration', limit, projected, 'warning'),
    })
  }
  return allowDecision()
}

function evaluateCost(
  limit: number | undefined,
  usage: ExecutionUsage,
  warningThreshold: number,
): BudgetObservation | undefined {
  if (limit === undefined) {
    return undefined
  }
  const current = usage.measuredCostUsd ?? usage.estimatedCostUsd
  return evaluateDimension('cost', limit, current, warningThreshold, false)
}

function evaluateDimension(
  dimension: BudgetDimension,
  limit: number | undefined,
  usage: number,
  warningThreshold: number,
  discrete: boolean,
): BudgetObservation | undefined {
  if (limit === undefined) {
    return undefined
  }
  if (usage > limit) {
    return createObservation(dimension, limit, usage, 'violation', 'limit_exceeded')
  }
  if (usage === limit) {
    return createObservation(dimension, limit, usage, 'violation', 'limit_reached')
  }

  const warningBoundary = discrete ? Math.ceil(limit * warningThreshold) : limit * warningThreshold
  if (usage >= warningBoundary) {
    return createObservation(dimension, limit, usage, 'warning')
  }
  return undefined
}

function decisionForNextCount(
  dimension: 'attempts' | 'tool_calls',
  limit: number,
  current: number,
  warningThreshold: number,
): BudgetDecision {
  const next = current + 1
  if (next > limit) {
    return Object.freeze({
      kind: 'DENY',
      observation: createObservation(dimension, limit, next, 'violation', 'limit_exceeded'),
    })
  }
  if (next === limit) {
    return Object.freeze({
      kind: 'WARN',
      observation: createObservation(dimension, limit, next, 'warning'),
    })
  }
  const warningBoundary = Math.ceil(limit * warningThreshold)
  if (next >= warningBoundary) {
    return Object.freeze({
      kind: 'WARN',
      observation: createObservation(dimension, limit, next, 'warning'),
    })
  }
  return { kind: 'ALLOW' }
}

function createObservation(
  dimension: BudgetDimension,
  limit: number,
  usage: number,
  kind: BudgetObservationKind,
  reason?: BudgetExceededReason,
): BudgetObservation {
  return Object.freeze({
    kind,
    dimension,
    limit,
    usage,
    utilization: usage / limit,
    remaining: Math.max(0, limit - usage),
    ...(reason === undefined ? {} : { reason }),
  })
}

function allowDecision(): BudgetDecision {
  return Object.freeze({ kind: 'ALLOW' })
}

function validateUsage(usage: ExecutionUsage): void {
  validateNonNegativeFinite(usage.estimatedCostUsd, 'estimatedCostUsd')
  if (usage.measuredCostUsd !== undefined) {
    validateNonNegativeFinite(usage.measuredCostUsd, 'measuredCostUsd')
  }
  validateNonNegativeInteger(usage.attempts, 'attempts')
  validateNonNegativeFinite(usage.elapsedSeconds, 'elapsedSeconds')
  validateNonNegativeInteger(usage.toolCalls, 'toolCalls')
}

function validateWarningThreshold(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new InvalidBudgetPolicyError(
      'warning threshold must be greater than zero and at most one',
    )
  }
}

function validateNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidBudgetPolicyError(`${field} must be finite and non-negative`)
  }
}

function validateNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidBudgetPolicyError(`${field} must be a non-negative integer`)
  }
}

function toMicros(value: number): number {
  return Math.round(value * USD_MICROS_PER_DOLLAR)
}

function fromMicros(value: number): number {
  return value / USD_MICROS_PER_DOLLAR
}

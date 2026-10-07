import { InvalidBudgetPolicyError } from './errors.js'

export interface BudgetPolicy {
  readonly maxCostUsd?: number
  readonly maxDurationSeconds?: number
  readonly maxAttempts?: number
  readonly maxToolCalls?: number
}

export interface NonNegativeMoney {
  readonly amountUsd: number
}

export function createNonNegativeMoney(value: unknown): NonNegativeMoney {
  if (!isFiniteNumber(value) || value < 0) {
    throw new InvalidBudgetPolicyError('Monetary values must be finite and non-negative')
  }

  return Object.freeze({ amountUsd: value })
}

export function createBudgetPolicy(value: unknown): BudgetPolicy {
  if (!isRecord(value)) {
    throw new InvalidBudgetPolicyError('Budget policy must be an object')
  }

  const maxCostUsd = readOptionalFiniteNumber(value, 'maxCostUsd')
  const maxDurationSeconds = readOptionalFiniteNumber(value, 'maxDurationSeconds')
  const maxAttempts = readOptionalInteger(value, 'maxAttempts')
  const maxToolCalls = readOptionalInteger(value, 'maxToolCalls')

  if (maxCostUsd !== undefined && maxCostUsd < 0) {
    throw new InvalidBudgetPolicyError('maxCostUsd must be non-negative')
  }
  if (maxDurationSeconds !== undefined && maxDurationSeconds <= 0) {
    throw new InvalidBudgetPolicyError('maxDurationSeconds must be greater than zero')
  }
  if (maxAttempts !== undefined && maxAttempts <= 0) {
    throw new InvalidBudgetPolicyError('maxAttempts must be greater than zero')
  }
  if (maxToolCalls !== undefined && maxToolCalls <= 0) {
    throw new InvalidBudgetPolicyError('maxToolCalls must be greater than zero')
  }

  return Object.freeze({
    ...(maxCostUsd === undefined ? {} : { maxCostUsd }),
    ...(maxDurationSeconds === undefined ? {} : { maxDurationSeconds }),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(maxToolCalls === undefined ? {} : { maxToolCalls }),
  })
}

function readOptionalFiniteNumber(
  record: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = record[field]
  if (value === undefined) {
    return undefined
  }
  if (!isFiniteNumber(value)) {
    throw new InvalidBudgetPolicyError(`${field} must be a finite number`)
  }

  return value
}

function readOptionalInteger(record: Record<string, unknown>, field: string): number | undefined {
  const value = readOptionalFiniteNumber(record, field)
  if (value === undefined) {
    return undefined
  }
  if (!Number.isInteger(value)) {
    throw new InvalidBudgetPolicyError(`${field} must be an integer`)
  }

  return value
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import { InvalidBudgetPolicyError } from './errors.js'

export interface BudgetPolicy {
  readonly maxCostUsd: number
  readonly maxDurationSeconds: number
  readonly maxAttempts: number
  readonly maxToolCalls: number
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

  const maxCostUsd = readFiniteNumber(value, 'maxCostUsd')
  const maxDurationSeconds = readFiniteNumber(value, 'maxDurationSeconds')
  const maxAttempts = readInteger(value, 'maxAttempts')
  const maxToolCalls = readInteger(value, 'maxToolCalls')

  if (maxCostUsd < 0) {
    throw new InvalidBudgetPolicyError('maxCostUsd must be non-negative')
  }
  if (maxDurationSeconds <= 0) {
    throw new InvalidBudgetPolicyError('maxDurationSeconds must be greater than zero')
  }
  if (maxAttempts <= 0) {
    throw new InvalidBudgetPolicyError('maxAttempts must be greater than zero')
  }
  if (maxToolCalls < 0) {
    throw new InvalidBudgetPolicyError('maxToolCalls must be non-negative')
  }

  return Object.freeze({
    maxCostUsd,
    maxDurationSeconds,
    maxAttempts,
    maxToolCalls,
  })
}

function readFiniteNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  if (!isFiniteNumber(value)) {
    throw new InvalidBudgetPolicyError(`${field} must be a finite number`)
  }

  return value
}

function readInteger(record: Record<string, unknown>, field: string): number {
  const value = readFiniteNumber(record, field)
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

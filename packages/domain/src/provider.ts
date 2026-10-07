import type { NonNegativeMoney } from './budget.js'
import { InvalidContractError } from './errors.js'
import type { JsonObject, JsonValue } from './messaging.js'

export type ProviderName = string

export interface ProviderCapabilities {
  readonly supportsCancellation: boolean
  readonly supportsCostEstimation: boolean
  readonly supportsMeasuredCost: boolean
  readonly supportsToolExecution: boolean
}

export interface ProviderExecutionRequest {
  readonly executionId: string
  readonly agentId: string
  readonly operation: string
  readonly input: JsonObject
  readonly attemptNumber: number
  readonly idempotencyKey?: string
  readonly metadata?: JsonObject
}

export interface ProviderExecutionContext {
  readonly executionId: string
  readonly attemptId: string
  readonly correlationId?: string
  readonly traceId?: string
  readonly spanId?: string
  readonly deadline?: string
  readonly cancellationRequested: boolean
}

export interface ProviderValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export interface ProviderCost {
  readonly estimated?: NonNegativeMoney
  readonly measured?: NonNegativeMoney
}

export enum ProviderFailureCategory {
  RETRYABLE = 'retryable',
  NON_RETRYABLE = 'non_retryable',
  RATE_LIMITED = 'rate_limited',
  TIMEOUT = 'timeout',
  UNAVAILABLE = 'unavailable',
}

export interface ProviderError {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly category: ProviderFailureCategory
  readonly providerCode?: string
  readonly retryAfterMs?: number
}

export interface ProviderSuccessResult {
  readonly kind: 'SUCCEEDED'
  readonly output: JsonValue
  readonly cost?: ProviderCost
  readonly artifactReferences?: readonly string[]
  readonly durationMs?: number
}

export interface ProviderFailureResult {
  readonly kind: 'FAILED'
  readonly error: ProviderError
  readonly cost?: ProviderCost
  readonly durationMs?: number
}

export type ProviderExecutionResult = ProviderSuccessResult | ProviderFailureResult

export type ProviderCancellationResult =
  | Readonly<{ kind: 'CANCELLED' }>
  | Readonly<{ kind: 'UNSUPPORTED' }>
  | Readonly<{ kind: 'FAILED'; error: ProviderError }>

export type ProviderHealth =
  | Readonly<{ status: 'healthy'; checkedAt: string }>
  | Readonly<{ status: 'degraded' | 'unhealthy'; checkedAt: string; reason?: string }>

export interface ExecutionProvider {
  readonly name: ProviderName
  readonly capabilities: ProviderCapabilities
  validateRequest(request: ProviderExecutionRequest): Promise<ProviderValidationResult>
  estimateCost(request: ProviderExecutionRequest): Promise<NonNegativeMoney | null>
  execute(
    request: ProviderExecutionRequest,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult>
  normalizeResult(raw: JsonValue): ProviderExecutionResult
  cancel?(request: ProviderExecutionRequest): Promise<ProviderCancellationResult>
  healthCheck(): Promise<ProviderHealth>
}

export function createProviderExecutionRequest(
  input: ProviderExecutionRequest,
): ProviderExecutionRequest {
  requireIdentifier(input.executionId, 'executionId')
  requireIdentifier(input.agentId, 'agentId')
  requireIdentifier(input.operation, 'operation')
  if (!isJsonObject(input.input)) {
    throw new InvalidContractError('input must be a JSON object')
  }
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber <= 0) {
    throw new InvalidContractError('attemptNumber must be a positive integer')
  }
  if (input.idempotencyKey !== undefined) {
    requireIdentifier(input.idempotencyKey, 'idempotencyKey')
  }
  if (input.metadata !== undefined && !isJsonObject(input.metadata)) {
    throw new InvalidContractError('metadata must be a JSON object')
  }
  return Object.freeze({ ...input })
}

export function isProviderFailure(
  result: ProviderExecutionResult,
): result is ProviderFailureResult {
  return result.kind === 'FAILED'
}

export function isProviderSuccess(
  result: ProviderExecutionResult,
): result is ProviderSuccessResult {
  return result.kind === 'SUCCEEDED'
}

export function providerFailureCategoryLabel(category: ProviderFailureCategory): string {
  switch (category) {
    case ProviderFailureCategory.RETRYABLE:
      return 'Retryable'
    case ProviderFailureCategory.NON_RETRYABLE:
      return 'Non-retryable'
    case ProviderFailureCategory.RATE_LIMITED:
      return 'Rate limited'
    case ProviderFailureCategory.TIMEOUT:
      return 'Timeout'
    case ProviderFailureCategory.UNAVAILABLE:
      return 'Unavailable'
    default:
      return assertNever(category)
  }
}

export function providerHealthStatusLabel(status: ProviderHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'Healthy'
    case 'degraded':
      return 'Degraded'
    case 'unhealthy':
      return 'Unhealthy'
    default:
      return assertNever(status)
  }
}

function requireIdentifier(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidContractError(`${field} must be a non-empty string`)
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNever(value: never): never {
  throw new Error(`Unexpected provider failure category: ${String(value)}`)
}

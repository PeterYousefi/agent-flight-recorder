import {
  createNonNegativeMoney,
  isJsonValue,
  InvalidContractError,
  ProviderFailureCategory,
  type ProviderExecutionResult,
  type ProviderCost,
  type JsonValue,
} from '@afr/domain'
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function invalid(): never {
  throw new InvalidContractError('Provider returned an invalid response')
}
function cost(value: unknown): ProviderCost | undefined {
  if (value === undefined) return undefined
  if (!record(value)) return invalid()
  const result: {
    estimated?: ReturnType<typeof createNonNegativeMoney>
    measured?: ReturnType<typeof createNonNegativeMoney>
  } = {}
  for (const kind of ['estimated', 'measured'] as const) {
    if (value[kind] === undefined) continue
    if (!record(value[kind])) return invalid()
    result[kind] = createNonNegativeMoney(value[kind].amountUsd)
  }
  return result
}
export function normalizeProviderResult(raw: JsonValue): ProviderExecutionResult {
  if (!record(raw)) return invalid()
  const providerCost = cost(raw.cost)
  const duration = raw.durationMs
  if (
    duration !== undefined &&
    (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0)
  )
    return invalid()
  const common = {
    ...(providerCost === undefined ? {} : { cost: providerCost }),
    ...(duration === undefined ? {} : { durationMs: duration as number }),
  }
  if (raw.kind === 'SUCCEEDED') {
    if (!isJsonValue(raw.output)) return invalid()
    return { kind: 'SUCCEEDED', output: raw.output, ...common }
  }
  if (raw.kind !== 'FAILED' || !record(raw.error)) return invalid()
  const error = raw.error
  if (
    typeof error.code !== 'string' ||
    error.code.length === 0 ||
    typeof error.message !== 'string' ||
    typeof error.retryable !== 'boolean' ||
    !Object.values(ProviderFailureCategory).includes(error.category as ProviderFailureCategory)
  )
    return invalid()
  if (
    error.retryAfterMs !== undefined &&
    (typeof error.retryAfterMs !== 'number' ||
      !Number.isFinite(error.retryAfterMs) ||
      error.retryAfterMs < 0)
  )
    return invalid()
  return {
    kind: 'FAILED',
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      category: error.category as ProviderFailureCategory,
      ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs as number }),
    },
    ...common,
  }
}

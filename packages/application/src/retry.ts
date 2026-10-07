import type { ProviderError } from '@afr/domain'

export interface RetryPolicy {
  readonly maxAttempts: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
  readonly random: () => number
}
export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  random: Math.random,
}
export function retryDelay(
  error: ProviderError,
  attemptNumber: number,
  policy: RetryPolicy,
  maxBudgetAttempts?: number,
): number | undefined {
  if (
    !Number.isSafeInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    !Number.isFinite(policy.baseDelayMs) ||
    policy.baseDelayMs < 1 ||
    !Number.isFinite(policy.maxDelayMs) ||
    policy.maxDelayMs < policy.baseDelayMs ||
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber < 1
  )
    throw new Error('Invalid retry policy')
  if (
    !error.retryable ||
    attemptNumber >= Math.min(policy.maxAttempts, maxBudgetAttempts ?? policy.maxAttempts)
  )
    return undefined
  const random = policy.random()
  if (!Number.isFinite(random) || random < 0 || random >= 1)
    throw new Error('Invalid retry jitter source')
  const bounded = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** Math.min(attemptNumber - 1, 30),
  )
  const jitter = Math.max(1, Math.floor(bounded * (0.5 + random / 2)))
  const retryAfter = error.retryAfterMs ?? 0
  // Refuse an unbounded provider hint rather than retrying earlier than requested.
  if (!Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > 86400000) return undefined
  return Math.max(jitter, retryAfter)
}

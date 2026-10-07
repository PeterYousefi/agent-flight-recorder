import { describe, expect, it } from 'vitest'
import { ProviderFailureCategory } from '@afr/domain'
import { retryDelay, type RetryPolicy } from './retry.js'
const policy: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 3000,
  random: () => 0.5,
}
const error = {
  code: 'TRANSIENT',
  message: 'Temporary failure',
  retryable: true,
  category: ProviderFailureCategory.RETRYABLE,
}
describe('bounded retry decisions', () => {
  it('uses exponential backoff with injected bounded jitter', () => {
    expect([1, 2, 3].map((attempt) => retryDelay(error, attempt, policy))).toEqual([
      750, 1500, 2250,
    ])
    expect(retryDelay(error, 4, policy)).toBeUndefined()
  })
  it('honors the smaller budget attempt cap and permanent failures', () => {
    expect(retryDelay(error, 2, policy, 2)).toBeUndefined()
    expect(retryDelay({ ...error, retryable: false }, 1, policy)).toBeUndefined()
  })
  it('honors bounded rate-limit delays and rejects invalid/unbounded hints', () => {
    expect(retryDelay({ ...error, retryAfterMs: 10000 }, 1, policy)).toBe(10000)
    expect(retryDelay({ ...error, retryAfterMs: -1 }, 1, policy)).toBeUndefined()
    expect(retryDelay({ ...error, retryAfterMs: 86400001 }, 1, policy)).toBeUndefined()
  })
  it('rejects invalid policy and jitter configuration', () => {
    expect(() => retryDelay(error, 1, { ...policy, baseDelayMs: 0 })).toThrow(
      'Invalid retry policy',
    )
    expect(() => retryDelay(error, 1, { ...policy, random: () => 1 })).toThrow(
      'Invalid retry jitter',
    )
  })
})

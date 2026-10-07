import { describe, expect, it } from 'vitest'
import {
  createProviderExecutionRequest,
  ProviderFailureCategory,
  type ProviderExecutionContext,
} from '@afr/domain'
import { MockProvider, normalizeProviderResult } from './index.js'
function request(
  scenario: string,
  attemptNumber = 1,
): ReturnType<typeof createProviderExecutionRequest> {
  return createProviderExecutionRequest({
    executionId: 'execution-1',
    agentId: 'test',
    operation: scenario,
    input: {},
    attemptNumber,
  })
}
const context: ProviderExecutionContext = {
  executionId: 'execution-1',
  attemptId: 'attempt-1',
  cancellationRequested: false,
}
describe('deterministic mock execution provider', () => {
  it('runs without credentials and reports synthetic estimated/measured costs', async () => {
    const provider = new MockProvider()
    expect(await provider.validateRequest(request('success'))).toEqual({ valid: true, errors: [] })
    expect(await provider.estimateCost(request('success'))).toEqual({ amountUsd: 0.005 })
    const first = await provider.execute(request('success'), context)
    expect(first).toEqual(await provider.execute(request('success'), context))
    expect(first.cost?.measured?.amountUsd).toBe(0.004)
    expect((await provider.healthCheck()).status).toBe('healthy')
  })
  it('fails transiently by attempt number then succeeds', async () => {
    const provider = new MockProvider()
    expect((await provider.execute(request('transient_failure'), context)).kind).toBe('FAILED')
    expect((await provider.execute(request('transient_failure', 2), context)).kind).toBe(
      'SUCCEEDED',
    )
  })
  it.each([
    ['permanent_failure', ProviderFailureCategory.NON_RETRYABLE, false],
    ['rate_limit', ProviderFailureCategory.RATE_LIMITED, true],
    ['timeout', ProviderFailureCategory.TIMEOUT, true],
    ['dead_letter', ProviderFailureCategory.RETRYABLE, true],
  ] as const)('normalizes %s failures', async (scenario, category, retryable) => {
    const result = await new MockProvider().execute(request(scenario), context)
    expect(result.kind).toBe('FAILED')
    if (result.kind === 'FAILED') expect(result.error).toMatchObject({ category, retryable })
  })
  it('distinguishes unknown measured cost from synthetic budget overrun', async () => {
    const provider = new MockProvider()
    expect(
      (await provider.execute(request('estimated_cost'), context)).cost?.measured,
    ).toBeUndefined()
    expect(
      (await provider.execute(request('budget_overrun'), context)).cost?.measured?.amountUsd,
    ).toBe(0.05)
  })
  it('injects timing and honors cancellation during a slow response', async () => {
    let release: () => void = () => {}
    const provider = new MockProvider({
      sleep: () =>
        new Promise((resolve) => {
          release = resolve
        }),
    })
    const execution = provider.execute(request('slow_response'), context)
    await provider.cancel(request('slow_response'))
    release()
    const result = await execution
    expect(result.kind === 'FAILED' && result.error.code).toBe('MOCK_CANCELLED')
    expect(
      (await provider.execute(request('success'), { ...context, cancellationRequested: true }))
        .kind,
    ).toBe('FAILED')
  })
  it('rejects malformed responses and unsafe configuration', async () => {
    const provider = new MockProvider()
    await expect(provider.execute(request('malformed_response'), context)).rejects.toThrow(
      'invalid response',
    )
    expect((await provider.validateRequest(request('unknown'))).valid).toBe(false)
    expect(
      (await provider.validateRequest({ ...request('slow_response'), input: { delayMs: -1 } }))
        .valid,
    ).toBe(false)
    expect(() =>
      normalizeProviderResult({
        kind: 'SUCCEEDED',
        output: {},
        cost: { measured: { amountUsd: -1 } },
      }),
    ).toThrow()
    expect(() => normalizeProviderResult({ kind: 'FAILED', error: { code: 'x' } })).toThrow()
  })
})

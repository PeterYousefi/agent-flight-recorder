import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderExecutionRequest, ProviderFailureCategory } from '@afr/domain'
import { SapiomProvider } from './index.js'
const request = createProviderExecutionRequest({
  executionId: 'execution-test',
  agentId: 'test',
  operation: 'chat.completions',
  input: { model: 'test-model', messages: [{ role: 'user', content: 'Hello' }], maxTokens: 16 },
  attemptNumber: 1,
})
const context = {
  executionId: request.executionId,
  attemptId: 'attempt-test',
  cancellationRequested: false,
}
beforeEach(() => {
  vi.stubEnv('SAPIOM_ENABLED', 'true')
  vi.stubEnv('SAPIOM_API_KEY', 'test-only-placeholder')
})
afterEach(() => vi.unstubAllEnvs())
describe('documented Sapiom Router adapter with mocked HTTP', () => {
  it('uses the verified endpoint and Bearer authentication without exposing credentials or inventing cost', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'test-model',
          choices: [{ message: { content: 'Hello' } }],
          usage: { total_tokens: 20 },
        }),
        { status: 200 },
      ),
    )
    const provider = new SapiomProvider({ fetch: http })
    const result = await provider.execute(request, context)
    expect(http.mock.calls[0]?.[0]).toBe('https://router.sapiom.ai/v1/chat/completions')
    expect(http.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer test-only-placeholder',
    })
    expect(JSON.parse(String(http.mock.calls[0]?.[1]?.body))).toMatchObject({
      max_tokens: 16,
      stream: false,
    })
    expect(result).toEqual({ kind: 'SUCCEEDED', output: { text: 'Hello', model: 'test-model' } })
    expect(await provider.estimateCost(request)).toBeNull()
    expect(JSON.stringify(provider)).not.toContain('test-only-placeholder')
    expect(JSON.stringify(await provider.healthCheck())).not.toContain('test-only-placeholder')
  })
  it.each([
    [429, ProviderFailureCategory.RATE_LIMITED, true],
    [500, ProviderFailureCategory.UNAVAILABLE, true],
    [401, ProviderFailureCategory.NON_RETRYABLE, false],
    [504, ProviderFailureCategory.TIMEOUT, true],
  ] as const)(
    'normalizes HTTP %s without retaining server error content',
    async (status, category, retryable) => {
      const http = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('sensitive server details', { status, headers: { 'retry-after': '5' } }),
        )
      const result = await new SapiomProvider({ fetch: http }).execute(request, context)
      expect(result.kind === 'FAILED' && result.error).toMatchObject({ category, retryable })
      expect(JSON.stringify(result)).not.toContain('sensitive server details')
      if (result.kind === 'FAILED' && status === 429) expect(result.error.retryAfterMs).toBe(5000)
    },
  )
  it('does not make requests when disabled, unconfigured or cancelled', async () => {
    const http = vi.fn<typeof fetch>()
    vi.stubEnv('SAPIOM_ENABLED', 'false')
    expect((await new SapiomProvider({ fetch: http }).execute(request, context)).kind).toBe(
      'FAILED',
    )
    vi.stubEnv('SAPIOM_ENABLED', 'true')
    vi.stubEnv('SAPIOM_API_KEY', '')
    expect((await new SapiomProvider({ fetch: http }).execute(request, context)).kind).toBe(
      'FAILED',
    )
    vi.stubEnv('SAPIOM_API_KEY', 'test-only-placeholder')
    await new SapiomProvider({ fetch: http }).execute(request, {
      ...context,
      cancellationRequested: true,
    })
    expect(http).not.toHaveBeenCalled()
  })
  it('classifies aborts and malformed responses', async () => {
    const aborted = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('safe test', 'AbortError'))
    const result = await new SapiomProvider({ fetch: aborted }).execute(request, context)
    expect(result.kind === 'FAILED' && result.error.category).toBe(ProviderFailureCategory.TIMEOUT)
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{bad json', { status: 200 }))
    expect((await new SapiomProvider({ fetch: malformed }).execute(request, context)).kind).toBe(
      'FAILED',
    )
    const unsupported = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }))
    expect((await new SapiomProvider({ fetch: unsupported }).execute(request, context)).kind).toBe(
      'FAILED',
    )
  })
})

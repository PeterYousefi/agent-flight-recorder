import { describe, expect, it } from 'vitest'
import { createProviderExecutionRequest } from '@afr/domain'
import { SapiomProvider } from './index.js'

describe.skipIf(process.env.RUN_SAPIOM_INTEGRATION_TESTS !== 'true')(
  'explicitly opted-in Sapiom live Router test',
  () => {
    it('executes one bounded chat request with application credentials', async () => {
      if (
        process.env.SAPIOM_ENABLED !== 'true' ||
        !process.env.SAPIOM_API_KEY ||
        !process.env.SAPIOM_MODEL
      )
        throw new Error('Live test requires SAPIOM_ENABLED, SAPIOM_API_KEY and SAPIOM_MODEL')
      const request = createProviderExecutionRequest({
        executionId: crypto.randomUUID(),
        agentId: 'afr-live-test',
        operation: 'chat.completions',
        attemptNumber: 1,
        input: {
          model: process.env.SAPIOM_MODEL,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          maxTokens: 16,
        },
      })
      const result = await new SapiomProvider().execute(request, {
        executionId: request.executionId,
        attemptId: crypto.randomUUID(),
        cancellationRequested: false,
      })
      expect(result.kind).toBe('SUCCEEDED')
    }, 30000)
  },
)

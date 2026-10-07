import { describe, expect, it } from 'vitest'

import {
  DomainErrorCode,
  InvalidContractError,
  ProviderFailureCategory,
  createArtifactMetadata,
  createArtifactReference,
  createMessageEnvelope,
  createProviderExecutionRequest,
  isJsonValue,
  isProviderFailure,
  isProviderSuccess,
  providerFailureCategoryLabel,
  providerHealthStatusLabel,
} from './index.js'

const timestamp = '2026-10-07T12:00:00.000Z'

describe('messaging port contracts', () => {
  it('creates a frozen JSON-safe message envelope', () => {
    const envelope = createMessageEnvelope({
      messageId: 'message-1',
      messageType: 'execution.requested',
      executionId: 'execution-1',
      correlationId: 'correlation-1',
      schemaVersion: 1,
      createdAt: timestamp,
      payload: { operation: 'run', attempt: 1 },
    })

    expect(Object.isFrozen(envelope)).toBe(true)
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope)
    expect(isJsonValue(envelope.payload)).toBe(true)
  })

  it.each([
    ['messageId', ''],
    ['executionId', ''],
    ['createdAt', 'invalid'],
    ['schemaVersion', 0],
  ] as const)('rejects invalid envelope %s', (field, value) => {
    expect(() =>
      createMessageEnvelope({
        messageId: 'message-1',
        messageType: 'execution.requested',
        executionId: 'execution-1',
        schemaVersion: 1,
        createdAt: timestamp,
        payload: {},
        [field]: value,
      }),
    ).toThrow(InvalidContractError)
  })

  it('models expected at-least-once delivery outcomes as a closed union', () => {
    const outcomes = [
      { kind: 'ACK' },
      { kind: 'RETRY', reason: 'temporary failure' },
      { kind: 'DEAD_LETTER', reason: 'invalid payload' },
    ] as const

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['ACK', 'RETRY', 'DEAD_LETTER'])
  })
})

describe('artifact store contracts', () => {
  it('creates opaque immutable references and metadata without provider URLs', () => {
    const reference = createArtifactReference({
      artifactId: 'artifact-1',
      executionId: 'execution-1',
      kind: 'tool_result',
    })
    const metadata = createArtifactMetadata({
      ...reference,
      contentType: 'application/json',
      sizeBytes: 12,
      checksum: 'sha256:abc',
      createdAt: timestamp,
    })

    expect(Object.isFrozen(reference)).toBe(true)
    expect(Object.isFrozen(metadata)).toBe(true)
    expect(metadata).not.toHaveProperty('url')
    expect(JSON.parse(JSON.stringify(metadata))).toEqual(metadata)
  })

  it('rejects invalid artifact metadata', () => {
    expect(() =>
      createArtifactReference({
        artifactId: '',
        executionId: 'execution-1',
        kind: 'tool_result',
      }),
    ).toThrow(InvalidContractError)
    expect(() =>
      createArtifactMetadata({
        artifactId: 'artifact-1',
        executionId: 'execution-1',
        kind: 'tool_result',
        contentType: 'application/json',
        sizeBytes: -1,
        createdAt: timestamp,
      }),
    ).toThrow(InvalidContractError)
  })
})

describe('provider contracts', () => {
  const request = createProviderExecutionRequest({
    executionId: 'execution-1',
    agentId: 'agent-1',
    operation: 'run',
    input: { prompt: 'hello' },
    attemptNumber: 1,
    idempotencyKey: 'request-1',
  })

  it('keeps provider requests narrow, immutable, and JSON-safe', () => {
    expect(request).not.toHaveProperty('status')
    expect(request).not.toHaveProperty('budgetPolicy')
    expect(Object.isFrozen(request)).toBe(true)
    expect(JSON.parse(JSON.stringify(request))).toEqual(request)
  })

  it('uses normalized discriminated success and failure results', () => {
    const success = {
      kind: 'SUCCEEDED' as const,
      output: { answer: 42 },
      cost: { estimated: { amountUsd: 0.1 } },
    }
    const failure = {
      kind: 'FAILED' as const,
      error: {
        code: 'TIMEOUT',
        message: 'Provider timed out',
        retryable: true,
        category: ProviderFailureCategory.TIMEOUT,
      },
    }

    expect(isProviderSuccess(success)).toBe(true)
    expect(isProviderFailure(failure)).toBe(true)
    expect(JSON.parse(JSON.stringify(success))).toEqual(success)
    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure)
    expect(failure).not.toHaveProperty('exception')
  })

  it('handles every retry category exhaustively', () => {
    for (const category of Object.values(ProviderFailureCategory)) {
      expect(providerFailureCategoryLabel(category)).toBeTypeOf('string')
    }
  })

  it('handles every provider health status exhaustively', () => {
    for (const status of ['healthy', 'degraded', 'unhealthy'] as const) {
      expect(providerHealthStatusLabel(status)).toBeTypeOf('string')
    }
  })

  it('rejects malformed provider requests', () => {
    expect(() => createProviderExecutionRequest({ ...request, attemptNumber: 0 })).toThrow(
      expect.objectContaining({ code: DomainErrorCode.INVALID_CONTRACT }),
    )
    expect(() => createProviderExecutionRequest({ ...request, input: [] as never })).toThrow(
      InvalidContractError,
    )
  })
})

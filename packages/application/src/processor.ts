import {
  createNonNegativeMoney,
  createMessageEnvelope,
  isJsonValue,
  ProviderFailureCategory,
  type ExecutionStore,
  type ArtifactStore,
  type MessageEnvelope,
  type JsonValue,
  type MessageHandlingResult,
  type ProviderExecutionResult,
  type ExecutionProvider,
} from '@afr/domain'
import { providerRequest, type ProviderRegistry, type Runtime, systemRuntime } from './runtime.js'
import { claimExecution } from './claim.js'
import { admitExecution } from './admission.js'
import { finishExecution } from './result-recorder.js'
export class ExecutionProcessor {
  public constructor(
    private readonly store: ExecutionStore,
    private readonly providers: ProviderRegistry,
    private readonly artifacts: ArtifactStore,
    private readonly runtime: Runtime = systemRuntime,
    private readonly leaseMs = 60000,
  ) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1)
      throw new Error('Invalid worker lease duration')
  }
  public async handle(message: MessageEnvelope<JsonValue>): Promise<MessageHandlingResult> {
    try {
      createMessageEnvelope(message)
    } catch {
      return { kind: 'DEAD_LETTER', reason: 'Invalid execution message' }
    }
    if (message.messageType !== 'execution.process' || message.schemaVersion !== 1)
      return { kind: 'DEAD_LETTER', reason: 'Unsupported execution message' }
    if ((await this.store.getExecution(message.executionId)) === undefined)
      return { kind: 'DEAD_LETTER', reason: 'Execution is missing' }
    const claimed = await claimExecution(
      this.store,
      message.executionId,
      this.runtime,
      this.leaseMs,
    )
    if (claimed === 'busy') return { kind: 'RETRY', reason: 'Execution attempt is already active' }
    if (claimed === undefined) return { kind: 'ACK' }
    const { execution, attempt } = claimed
    const request = providerRequest(execution, attempt.attemptNumber)
    let provider: ExecutionProvider
    let estimate: number | null
    try {
      provider = this.providers.get(execution.request.provider)
      estimate = (await provider.estimateCost(request))?.amountUsd ?? null
      if (estimate !== null) createNonNegativeMoney(estimate)
    } catch {
      await finishExecution(
        this.store,
        this.artifacts,
        claimed,
        {
          kind: 'FAILED',
          error: {
            code: 'PROVIDER_UNAVAILABLE',
            message: 'Provider is unavailable or returned an invalid estimate',
            retryable: false,
            category: ProviderFailureCategory.NON_RETRYABLE,
          },
        },
        this.runtime,
      )
      return { kind: 'ACK' }
    }
    if (!(await admitExecution(this.store, claimed, estimate, this.runtime))) return { kind: 'ACK' }
    let result: ProviderExecutionResult
    try {
      const raw = await provider.execute(request, {
        executionId: execution.id,
        attemptId: attempt.id,
        cancellationRequested: false,
        deadline: attempt.leaseExpiresAt!.toISOString(),
      })
      if (!isJsonValue(raw)) throw new Error('Invalid response')
      result = provider.normalizeResult(raw)
    } catch {
      result = {
        kind: 'FAILED',
        error: {
          code: 'PROVIDER_ERROR',
          message: 'Provider execution failed or returned an invalid response',
          retryable: false,
          category: ProviderFailureCategory.NON_RETRYABLE,
        },
      }
    }
    await finishExecution(this.store, this.artifacts, claimed, result, this.runtime)
    return { kind: 'ACK' }
  }
}

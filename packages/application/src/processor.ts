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
import { defaultRetryPolicy, type RetryPolicy } from './retry.js'
import { systemTiming, ProviderDeadlineError, type ProviderTiming } from './timing.js'
export class ExecutionProcessor {
  public constructor(
    private readonly store: ExecutionStore,
    private readonly providers: ProviderRegistry,
    private readonly artifacts: ArtifactStore,
    private readonly runtime: Runtime = systemRuntime,
    private readonly leaseMs = 60000,
    private readonly retryPolicy: RetryPolicy = defaultRetryPolicy,
    private readonly timing: ProviderTiming = systemTiming,
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
    if (
      message.payload === null ||
      typeof message.payload !== 'object' ||
      Array.isArray(message.payload) ||
      !Number.isSafeInteger(message.payload.attemptNumber) ||
      typeof message.payload.attemptNumber !== 'number' ||
      message.payload.attemptNumber < 1
    )
      return { kind: 'DEAD_LETTER', reason: 'Invalid execution attempt number' }
    if ((await this.store.getExecution(message.executionId)) === undefined)
      return { kind: 'DEAD_LETTER', reason: 'Execution is missing' }
    const claimed = await claimExecution(
      this.store,
      message.executionId,
      this.runtime,
      this.leaseMs,
      message.payload.attemptNumber,
      this.retryPolicy,
    )
    if (claimed === 'busy') return { kind: 'RETRY', reason: 'Execution attempt is already active' }
    if (claimed === undefined) return { kind: 'ACK' }
    const { execution, attempt } = claimed
    const request = providerRequest(execution, attempt.attemptNumber)
    let provider: ExecutionProvider
    let estimate: number | null
    try {
      provider = this.providers.get(execution.request.provider)
      estimate =
        (
          await this.timing.run(
            () => provider.estimateCost(request),
            Math.min(30000, Math.max(1, this.leaseMs * 0.8)),
          )
        )?.amountUsd ?? null
      if (estimate !== null) createNonNegativeMoney(estimate)
    } catch (error) {
      const timeout = error instanceof ProviderDeadlineError
      await finishExecution(
        this.store,
        this.artifacts,
        claimed,
        {
          kind: 'FAILED',
          error: {
            code: timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
            message: timeout
              ? 'Provider deadline exceeded'
              : 'Provider is unavailable or returned an invalid estimate',
            retryable: timeout,
            category: timeout
              ? ProviderFailureCategory.TIMEOUT
              : ProviderFailureCategory.NON_RETRYABLE,
          },
        },
        this.runtime,
        this.retryPolicy,
      )
      return { kind: 'ACK' }
    }
    if (!(await admitExecution(this.store, claimed, estimate, this.runtime))) return { kind: 'ACK' }
    let result: ProviderExecutionResult
    try {
      const raw = await this.timing.run(
        () =>
          provider.execute(request, {
            executionId: execution.id,
            attemptId: attempt.id,
            cancellationRequested: false,
            deadline: attempt.leaseExpiresAt!.toISOString(),
          }),
        Math.min(30000, Math.max(1, this.leaseMs * 0.8)),
      )
      if (!isJsonValue(raw)) throw new Error('Invalid response')
      result = provider.normalizeResult(raw)
    } catch (error) {
      const timeout = error instanceof ProviderDeadlineError
      result = {
        kind: 'FAILED',
        error: {
          code: timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
          message: timeout
            ? 'Provider deadline exceeded'
            : 'Provider execution failed or returned an invalid response',
          retryable: timeout,
          category: timeout
            ? ProviderFailureCategory.TIMEOUT
            : ProviderFailureCategory.NON_RETRYABLE,
        },
      }
    }
    await finishExecution(
      this.store,
      this.artifacts,
      claimed,
      result,
      this.runtime,
      this.retryPolicy,
    )
    return { kind: 'ACK' }
  }
}

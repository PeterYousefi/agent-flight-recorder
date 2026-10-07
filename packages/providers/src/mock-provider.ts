import {
  createNonNegativeMoney,
  ProviderFailureCategory,
  createProviderExecutionRequest,
  type ExecutionProvider,
  type ProviderExecutionRequest,
  type ProviderExecutionContext,
  type ProviderExecutionResult,
  type ProviderValidationResult,
  type NonNegativeMoney,
  type JsonValue,
  type ProviderHealth,
  type ProviderCancellationResult,
} from '@afr/domain'
import { normalizeProviderResult } from './normalize.js'

export const mockScenarios = [
  'success',
  'transient_failure',
  'permanent_failure',
  'rate_limit',
  'timeout',
  'slow_response',
  'malformed_response',
  'estimated_cost',
  'measured_cost',
  'budget_overrun',
  'cancellation',
  'dead_letter',
] as const
export type MockScenario = (typeof mockScenarios)[number]
export interface MockProviderOptions {
  readonly now?: () => Date
  readonly sleep?: (ms: number) => Promise<void>
}
export class MockProvider implements ExecutionProvider {
  public readonly name = 'mock'
  public readonly capabilities = {
    supportsCancellation: true,
    supportsCostEstimation: true,
    supportsMeasuredCost: true,
    supportsToolExecution: true,
  }
  private readonly cancelled = new Set<string>()
  private readonly now: () => Date
  private readonly sleep: (ms: number) => Promise<void>
  public constructor(options: MockProviderOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }
  private scenario(request: ProviderExecutionRequest): MockScenario {
    const scenario = request.input.scenario ?? request.operation
    if (typeof scenario !== 'string' || !mockScenarios.includes(scenario as MockScenario))
      throw new Error('Unknown mock scenario')
    return scenario as MockScenario
  }
  public async validateRequest(
    request: ProviderExecutionRequest,
  ): Promise<ProviderValidationResult> {
    try {
      createProviderExecutionRequest(request)
      this.scenario(request)
      for (const field of ['estimatedCostUsd', 'measuredCostUsd'] as const)
        if (request.input[field] !== undefined) createNonNegativeMoney(request.input[field])
      const delay = request.input.delayMs
      if (
        delay !== undefined &&
        (typeof delay !== 'number' || !Number.isSafeInteger(delay) || delay < 0 || delay > 60000)
      )
        return { valid: false, errors: ['Invalid mock delay'] }
      const failUntil = request.input.failUntilAttempt
      if (
        failUntil !== undefined &&
        (typeof failUntil !== 'number' ||
          !Number.isSafeInteger(failUntil) ||
          failUntil < 1 ||
          failUntil > 100)
      )
        return { valid: false, errors: ['Invalid mock failure count'] }
      return { valid: true, errors: [] }
    } catch {
      return { valid: false, errors: ['Invalid mock scenario or configuration'] }
    }
  }
  public async estimateCost(request: ProviderExecutionRequest): Promise<NonNegativeMoney> {
    return createNonNegativeMoney(request.input.estimatedCostUsd ?? 0.005)
  }
  public async execute(
    request: ProviderExecutionRequest,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult> {
    const scenario = this.scenario(request)
    const failUntil =
      typeof request.input.failUntilAttempt === 'number' ? request.input.failUntilAttempt : 1
    const failure = (
      code: string,
      category: ProviderFailureCategory,
      retryable: boolean,
      retryAfterMs?: number,
    ): ProviderExecutionResult => ({
      kind: 'FAILED',
      error: {
        code,
        message: `Mock scenario: ${scenario}`,
        category,
        retryable,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      },
    })
    if (context.cancellationRequested || this.cancelled.has(request.executionId))
      return failure('MOCK_CANCELLED', ProviderFailureCategory.NON_RETRYABLE, false)
    if (scenario === 'slow_response' || scenario === 'cancellation') {
      await this.sleep(typeof request.input.delayMs === 'number' ? request.input.delayMs : 2000)
      if (this.cancelled.has(request.executionId))
        return failure('MOCK_CANCELLED', ProviderFailureCategory.NON_RETRYABLE, false)
    }
    if (scenario === 'malformed_response')
      return this.normalizeResult({ unexpected: 'malformed mock output' })
    if (scenario === 'transient_failure' && request.attemptNumber <= failUntil)
      return failure('MOCK_TRANSIENT', ProviderFailureCategory.RETRYABLE, true)
    if (scenario === 'permanent_failure')
      return failure('MOCK_PERMANENT', ProviderFailureCategory.NON_RETRYABLE, false)
    if (scenario === 'dead_letter')
      return failure('MOCK_EXHAUSTED', ProviderFailureCategory.RETRYABLE, true)
    if (scenario === 'rate_limit' && request.attemptNumber <= failUntil)
      return failure('MOCK_RATE_LIMITED', ProviderFailureCategory.RATE_LIMITED, true, 1000)
    if (scenario === 'timeout')
      return failure('MOCK_TIMEOUT', ProviderFailureCategory.TIMEOUT, true)
    const estimated = await this.estimateCost(request)
    const measured = createNonNegativeMoney(
      request.input.measuredCostUsd ?? (scenario === 'budget_overrun' ? 0.05 : 0.004),
    )
    return {
      kind: 'SUCCEEDED',
      output: {
        summary: 'Mock execution completed',
        scenario,
        attemptNumber: request.attemptNumber,
        simulated: true,
      },
      cost: { estimated, ...(scenario === 'estimated_cost' ? {} : { measured }) },
    }
  }
  public normalizeResult(raw: JsonValue): ProviderExecutionResult {
    return normalizeProviderResult(raw)
  }
  public async cancel(request: ProviderExecutionRequest): Promise<ProviderCancellationResult> {
    this.cancelled.add(request.executionId)
    return { kind: 'CANCELLED' }
  }
  public async healthCheck(): Promise<ProviderHealth> {
    return { status: 'healthy', checkedAt: this.now().toISOString() }
  }
}

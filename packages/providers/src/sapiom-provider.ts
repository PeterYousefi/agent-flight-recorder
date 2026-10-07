import {
  ProviderFailureCategory,
  InvalidContractError,
  type ExecutionProvider,
  type ProviderExecutionRequest,
  type ProviderExecutionContext,
  type ProviderExecutionResult,
  type ProviderValidationResult,
  type NonNegativeMoney,
  type JsonValue,
  type ProviderHealth,
  type ProviderError,
} from '@afr/domain'
import { normalizeProviderResult } from './normalize.js'

const endpoint = 'https://router.sapiom.ai/v1/chat/completions'
interface SapiomOptions {
  readonly fetch?: typeof fetch
  readonly now?: () => Date
  readonly timeoutMs?: number
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function failure(
  code: string,
  category: ProviderFailureCategory,
  retryable: boolean,
  retryAfterMs?: number,
): ProviderExecutionResult {
  return {
    kind: 'FAILED',
    error: {
      code,
      message: 'Sapiom request did not complete successfully',
      category,
      retryable,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    },
  }
}
export class SapiomProvider implements ExecutionProvider {
  public readonly name = 'sapiom'
  public readonly capabilities = {
    supportsCancellation: false,
    supportsCostEstimation: false,
    supportsMeasuredCost: false,
    supportsToolExecution: false,
  }
  #apiKey: string | undefined
  #enabled: boolean
  private readonly http: typeof fetch
  private readonly now: () => Date
  private readonly timeoutMs: number
  public constructor(options: SapiomOptions = {}) {
    this.#enabled = process.env.SAPIOM_ENABLED === 'true'
    this.#apiKey = process.env.SAPIOM_API_KEY
    this.http = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date())
    this.timeoutMs = options.timeoutMs ?? 20000
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30000)
      throw new Error('Invalid Sapiom timeout')
  }
  public get configured(): boolean {
    return this.#enabled && (this.#apiKey?.trim().length ?? 0) > 0
  }
  public async validateRequest(
    request: ProviderExecutionRequest,
  ): Promise<ProviderValidationResult> {
    const input = request.input
    if (
      request.operation !== 'chat.completions' ||
      typeof input.model !== 'string' ||
      input.model.length === 0 ||
      input.model.length > 128 ||
      !Array.isArray(input.messages) ||
      input.messages.length === 0 ||
      input.messages.length > 20
    )
      return { valid: false, errors: ['Expected model and nonempty chat messages'] }
    for (const message of input.messages) {
      if (
        !record(message) ||
        !['system', 'user', 'assistant'].includes(String(message.role)) ||
        typeof message.content !== 'string' ||
        message.content.length === 0 ||
        message.content.length > 32768
      )
        return { valid: false, errors: ['Invalid chat message'] }
    }
    if (
      input.maxTokens !== undefined &&
      (typeof input.maxTokens !== 'number' ||
        !Number.isSafeInteger(input.maxTokens) ||
        input.maxTokens < 1 ||
        input.maxTokens > 4096)
    )
      return { valid: false, errors: ['Invalid token limit'] }
    return { valid: true, errors: [] }
  }
  public async estimateCost(_request: ProviderExecutionRequest): Promise<NonNegativeMoney | null> {
    return null
  }
  public async execute(
    request: ProviderExecutionRequest,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult> {
    if (!this.configured)
      return failure('SAPIOM_NOT_CONFIGURED', ProviderFailureCategory.NON_RETRYABLE, false)
    if (!(await this.validateRequest(request)).valid)
      return failure('SAPIOM_INVALID_REQUEST', ProviderFailureCategory.NON_RETRYABLE, false)
    if (context.cancellationRequested)
      return failure('SAPIOM_CANCELLED', ProviderFailureCategory.NON_RETRYABLE, false)
    const controller = new AbortController()
    const remaining =
      context.deadline === undefined
        ? this.timeoutMs
        : Date.parse(context.deadline) - this.now().getTime()
    if (!Number.isFinite(remaining) || remaining <= 0)
      return failure('SAPIOM_TIMEOUT', ProviderFailureCategory.TIMEOUT, true)
    const timer = setTimeout(() => controller.abort(), Math.min(remaining, this.timeoutMs))
    try {
      const response = await this.http(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.#apiKey!}`,
          'Content-Type': 'application/json',
          'x-sapiom-lane': 'run_now',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: request.input.model,
          messages: request.input.messages,
          max_tokens: request.input.maxTokens ?? 256,
          stream: false,
        }),
      })
      if (!response.ok) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'), this.now())
        if (response.status === 429)
          return failure(
            'SAPIOM_RATE_LIMITED',
            ProviderFailureCategory.RATE_LIMITED,
            true,
            retryAfter,
          )
        if (response.status === 408 || response.status === 504)
          return failure('SAPIOM_TIMEOUT', ProviderFailureCategory.TIMEOUT, true)
        if (response.status >= 500)
          return failure('SAPIOM_UNAVAILABLE', ProviderFailureCategory.UNAVAILABLE, true)
        return failure(
          response.status === 401 || response.status === 403
            ? 'SAPIOM_AUTHENTICATION_FAILED'
            : 'SAPIOM_REQUEST_REJECTED',
          ProviderFailureCategory.NON_RETRYABLE,
          false,
        )
      }
      const text = await response.text()
      if (Buffer.byteLength(text) > 1024 * 1024)
        return failure('SAPIOM_INVALID_RESPONSE', ProviderFailureCategory.NON_RETRYABLE, false)
      const raw: unknown = JSON.parse(text)
      if (
        !record(raw) ||
        !Array.isArray(raw.choices) ||
        !record(raw.choices[0]) ||
        !record(raw.choices[0].message) ||
        typeof raw.choices[0].message.content !== 'string'
      )
        return failure('SAPIOM_INVALID_RESPONSE', ProviderFailureCategory.NON_RETRYABLE, false)
      // Token usage is not a dollar amount. Do not infer measured or estimated cost.
      return {
        kind: 'SUCCEEDED',
        output: {
          text: raw.choices[0].message.content,
          model: typeof raw.model === 'string' ? raw.model : String(request.input.model),
        },
      }
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      )
        return failure('SAPIOM_TIMEOUT', ProviderFailureCategory.TIMEOUT, true)
      if (error instanceof SyntaxError)
        return failure('SAPIOM_INVALID_RESPONSE', ProviderFailureCategory.NON_RETRYABLE, false)
      return failure('SAPIOM_UNAVAILABLE', ProviderFailureCategory.UNAVAILABLE, true)
    } finally {
      clearTimeout(timer)
    }
  }
  public normalizeResult(raw: JsonValue): ProviderExecutionResult {
    try {
      return normalizeProviderResult(raw)
    } catch {
      throw new InvalidContractError('Sapiom returned an invalid normalized result')
    }
  }
  public async healthCheck(): Promise<ProviderHealth> {
    return {
      status: 'degraded',
      checkedAt: this.now().toISOString(),
      reason: this.configured
        ? 'Configured; live provider health has not been probed'
        : 'Sapiom disabled or credentials absent',
    }
  }
}
function parseRetryAfter(value: string | null, now: Date): ProviderError['retryAfterMs'] {
  if (value === null) return undefined
  const seconds = Number(value)
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now.getTime()
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}

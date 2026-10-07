import { randomUUID } from 'node:crypto'
import {
  createExecutionEvent,
  createProviderExecutionRequest,
  isJsonValue,
  type Execution,
  type ExecutionRepositories,
  type ExecutionEventType,
  type EventPayloadMap,
  type ExecutionProvider,
  type ProviderExecutionRequest,
  type JsonObject,
} from '@afr/domain'
import { ApplicationError } from './errors.js'

export interface Runtime {
  readonly now: () => Date
  readonly id: () => string
}
export const systemRuntime: Runtime = { now: () => new Date(), id: randomUUID }
export class ProviderRegistry {
  private readonly providers: ReadonlyMap<string, ExecutionProvider>
  public constructor(providers: readonly ExecutionProvider[]) {
    this.providers = new Map(providers.map((p) => [p.name, p]))
  }
  public get(name: string): ExecutionProvider {
    const provider = this.providers.get(name)
    if (provider === undefined)
      throw new ApplicationError('PROVIDER_UNAVAILABLE', 'Requested provider is unavailable')
    return provider
  }
}
export function providerRequest(
  execution: Execution,
  attemptNumber: number,
): ProviderExecutionRequest {
  if (!isJsonValue(execution.request.input))
    throw new ApplicationError('INVALID_REQUEST', 'Input must be JSON')
  return createProviderExecutionRequest({
    executionId: execution.id,
    agentId: execution.request.agentId,
    operation: execution.request.operation,
    input: execution.request.input as JsonObject,
    attemptNumber,
    // Provider idempotency is execution-scoped; replay intentionally has a new ID.
    idempotencyKey: execution.id,
  })
}
export async function append<T extends ExecutionEventType>(
  tx: ExecutionRepositories,
  executionId: string,
  type: T,
  payload: EventPayloadMap[T],
  runtime: Runtime,
): Promise<void> {
  const history = await tx.listEvents(executionId)
  const previous = history.at(-1)
  const timestamp = new Date(
    Math.max(runtime.now().getTime(), previous === undefined ? 0 : Date.parse(previous.timestamp)),
  ).toISOString()
  await tx.appendEvent(
    createExecutionEvent({
      eventId: runtime.id(),
      executionId,
      eventType: type,
      sequence: history.length + 1,
      timestamp,
      payload,
    }),
  )
}

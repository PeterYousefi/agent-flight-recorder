import { InvalidContractError } from './errors.js'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { readonly [key: string]: JsonValue }

export interface MessageEnvelope<TPayload extends JsonValue = JsonObject> {
  readonly messageId: string
  readonly messageType: string
  readonly executionId: string
  readonly traceparent?: string
  readonly correlationId?: string
  readonly causationId?: string
  readonly schemaVersion: number
  readonly createdAt: string
  readonly payload: TPayload
}

export interface SubscriptionOptions {
  readonly consumerName?: string
  readonly maxConcurrentMessages?: number
}

export type MessageHandlingResult =
  | Readonly<{ kind: 'ACK' }>
  | Readonly<{ kind: 'RETRY'; reason: string }>
  | Readonly<{ kind: 'DEAD_LETTER'; reason: string }>

export type MessageHandler<TPayload extends JsonValue = JsonObject> = (
  message: MessageEnvelope<TPayload>,
) => MessageHandlingResult | Promise<MessageHandlingResult>

export interface Subscription {
  close(): Promise<void>
}

/**
 * Implementations should assume at-least-once delivery. ACK means the message
 * may be completed, RETRY requests redelivery, and DEAD_LETTER rejects it.
 * Unexpected handler exceptions should be translated by adapters to RETRY or
 * DEAD_LETTER according to their failure policy.
 */
export interface MessageBus {
  publish<TPayload extends JsonValue>(message: MessageEnvelope<TPayload>): Promise<void>
  subscribe<TPayload extends JsonValue>(
    handler: MessageHandler<TPayload>,
    options?: SubscriptionOptions,
  ): Promise<Subscription>
}

export function createMessageEnvelope<TPayload extends JsonValue>(input: {
  readonly messageId: string
  readonly messageType: string
  readonly executionId: string
  readonly traceparent?: string
  readonly correlationId?: string
  readonly causationId?: string
  readonly schemaVersion: number
  readonly createdAt: string
  readonly payload: TPayload
}): MessageEnvelope<TPayload> {
  requireIdentifier(input.messageId, 'messageId')
  requireIdentifier(input.messageType, 'messageType')
  requireIdentifier(input.executionId, 'executionId')
  if (
    input.traceparent !== undefined &&
    !/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(input.traceparent)
  )
    throw new InvalidContractError('Invalid W3C trace context')
  requireOptionalIdentifier(input.correlationId, 'correlationId')
  requireOptionalIdentifier(input.causationId, 'causationId')
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion <= 0) {
    throw new InvalidContractError('schemaVersion must be a positive integer')
  }
  requireTimestamp(input.createdAt, 'createdAt')
  if (!isJsonValue(input.payload)) {
    throw new InvalidContractError('payload must be JSON serializable')
  }

  return Object.freeze({
    ...input,
  })
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isJsonValue)
  }
  return false
}

function requireIdentifier(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidContractError(`${field} must be a non-empty string`)
  }
}

function requireOptionalIdentifier(value: string | undefined, field: string): void {
  if (value !== undefined) {
    requireIdentifier(value, field)
  }
}

function requireTimestamp(value: string, field: string): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || !value.includes('T')) {
    throw new InvalidContractError(`${field} must be a valid ISO-8601 timestamp`)
  }
}

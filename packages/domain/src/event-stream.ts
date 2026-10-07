import {
  InvalidEventStreamError,
  InvalidEventSequenceError,
  UnsupportedEventSchemaError,
} from './errors.js'
import {
  ExecutionEventType,
  SUPPORTED_EVENT_SCHEMA_VERSIONS,
  type ExecutionEvent,
} from './events.js'

const FINAL_EVENT_TYPES = new Set<ExecutionEventType>([
  ExecutionEventType.EXECUTION_SUCCEEDED,
  ExecutionEventType.EXECUTION_CANCELLED,
  ExecutionEventType.EXECUTION_BUDGET_EXCEEDED,
  ExecutionEventType.EXECUTION_DEAD_LETTERED,
])

// Event factories validate individual facts; this helper validates stream order
// and consistency. Database concurrency and global uniqueness remain persistence concerns.
export function validateExecutionEventStream(
  events: readonly ExecutionEvent[],
): readonly ExecutionEvent[] {
  if (events.length === 0) {
    throw new InvalidEventStreamError('Event stream must contain at least one event')
  }
  const firstEvent = events[0]
  if (firstEvent === undefined) {
    throw new InvalidEventStreamError('Event stream must contain at least one event')
  }
  if (firstEvent.eventType !== ExecutionEventType.EXECUTION_CREATED) {
    throw new InvalidEventStreamError('The first event must be execution.created')
  }

  const executionId = firstEvent.executionId
  let previousSequence = 0
  let finalEventSeen = false

  for (const [index, event] of events.entries()) {
    if (event.executionId !== executionId) {
      throw new InvalidEventStreamError('All events must belong to the same execution')
    }
    if (!SUPPORTED_EVENT_SCHEMA_VERSIONS.includes(event.schemaVersion)) {
      throw new UnsupportedEventSchemaError(event.schemaVersion)
    }
    if (event.sequence !== previousSequence + 1) {
      throw new InvalidEventSequenceError(
        `Expected sequence ${previousSequence + 1}, received ${event.sequence}`,
      )
    }
    const previousEvent = index > 0 ? events[index - 1] : undefined
    if (previousEvent !== undefined && event.timestamp < previousEvent.timestamp) {
      throw new InvalidEventStreamError('Event timestamps must not move backwards')
    }
    if (finalEventSeen) {
      throw new InvalidEventStreamError(
        `Event ${event.eventType} cannot follow a final terminal event`,
      )
    }

    if (FINAL_EVENT_TYPES.has(event.eventType)) {
      finalEventSeen = true
    }
    previousSequence = event.sequence
  }

  return events
}

export function isFinalExecutionEvent(event: ExecutionEvent): boolean {
  return FINAL_EVENT_TYPES.has(event.eventType)
}

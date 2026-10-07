import type { Execution, ExecutionStatus, ReplayMode } from './execution.js'
import type { ExecutionAttempt } from './attempt.js'
import type { ExecutionEvent } from './events.js'
import type { JsonObject, MessageEnvelope } from './messaging.js'

export interface ExecutionQuery {
  readonly limit?: number
  readonly offset?: number
  readonly status?: ExecutionStatus
}
export interface CostRecord {
  readonly id: string
  readonly executionId: string
  readonly attemptId?: string
  readonly category: string
  readonly kind: 'estimated' | 'measured'
  readonly amountMicroUsd: bigint
  readonly timestamp: Date
}
export interface StoredArtifact {
  readonly id: string
  readonly executionId: string
  readonly kind: string
  readonly contentType: string
  readonly sizeBytes: bigint
  readonly checksum?: string
  readonly storageKey: string
  readonly createdAt: Date
}
export interface ReplayRelationship {
  readonly id: string
  readonly originalExecutionId: string
  readonly replayExecutionId: string
  readonly replayMode: ReplayMode
  readonly createdAt: Date
}
export interface DeadLetterRecord {
  readonly id: string
  readonly executionId: string
  readonly finalAttempt: number
  readonly reason: string
  readonly deadLetteredAt: Date
  readonly requeuedAsExecutionId?: string
}
export interface AuditRecord {
  readonly id: string
  readonly executionId?: string
  readonly action: string
  readonly actorId?: string
  readonly timestamp: Date
  readonly metadata?: JsonObject
}

// No database client or transport types cross this boundary.
export interface OutboxRecord {
  readonly id: string
  readonly executionId: string
  readonly message: MessageEnvelope
  readonly availableAt: Date
}
export interface ExecutionSummary {
  readonly executionId: string
  readonly attemptCount: number
  readonly estimatedMicroUsd: bigint | null
  readonly measuredMicroUsd: bigint | null
}
export interface ExecutionOverview {
  readonly total: number
  readonly succeeded: number
  readonly failed: number
  readonly cancelled: number
  readonly budgetExceeded: number
  readonly deadLetters: number
  readonly retries: number
  readonly replays: number
  readonly toolCalls: number
  readonly pendingOutbox: number
  readonly p50Seconds: number | null
  readonly p95Seconds: number | null
  readonly estimatedMicroUsd: bigint | null
  readonly measuredMicroUsd: bigint | null
  readonly hourly: readonly { hour: string; created: number; succeeded: number; failed: number }[]
}
export interface ExecutionRepositories {
  getExecutionSummaries(ids: readonly string[]): Promise<readonly ExecutionSummary[]>
  getOverview(): Promise<ExecutionOverview>
  createOutbox(record: OutboxRecord): Promise<void>
  listPendingOutbox(now: Date, limit?: number): Promise<readonly OutboxRecord[]>
  markOutboxPublished(id: string, now: Date): Promise<void>
  createExecution(execution: Execution): Promise<Execution>
  getExecution(id: string): Promise<Execution | undefined>
  listExecutions(query?: ExecutionQuery): Promise<readonly Execution[]>
  updateExecutionSnapshot(
    id: string,
    expectedStatus: ExecutionStatus,
    status: ExecutionStatus,
    now: Date,
  ): Promise<Execution>
  appendEvent(event: ExecutionEvent): Promise<void>
  listEvents(executionId: string): Promise<readonly ExecutionEvent[]>
  createAttempt(attempt: ExecutionAttempt): Promise<void>
  finishAttempt(attempt: ExecutionAttempt): Promise<void>
  listAttempts(executionId: string): Promise<readonly ExecutionAttempt[]>
  recordCost(cost: CostRecord): Promise<void>
  listCosts(executionId: string): Promise<readonly CostRecord[]>
  recordArtifact(artifact: StoredArtifact): Promise<void>
  listArtifacts(executionId: string): Promise<readonly StoredArtifact[]>
  createReplayRelationship(relationship: ReplayRelationship): Promise<void>
  getReplayRelationship(replayExecutionId: string): Promise<ReplayRelationship | undefined>
  createDeadLetter(record: DeadLetterRecord): Promise<void>
  getDeadLetter(id: string): Promise<DeadLetterRecord | undefined>
  createDeadLetterRequeue(
    id: string,
    deadLetterId: string,
    newExecutionId: string,
    createdAt: Date,
  ): Promise<void>
  getRequeuedExecutionId(deadLetterId: string): Promise<string | undefined>
  listDeadLetters(query?: ExecutionQuery): Promise<readonly DeadLetterRecord[]>
  createAuditRecord(record: AuditRecord): Promise<void>
  listAuditRecords(executionId: string): Promise<readonly AuditRecord[]>
}
export interface ExecutionStore extends ExecutionRepositories {
  createExecutionIdempotently(
    execution: Execution,
  ): Promise<{ readonly execution: Execution; readonly created: boolean }>
  // Locks a single execution before invoking the callback. All callback writes
  // commit together; callbacks must contain database work only, never providers.
  transaction<T>(
    executionId: string,
    work: (repositories: ExecutionRepositories) => Promise<T>,
  ): Promise<T>
}

import type { Execution, ExecutionStatus, ReplayMode } from './execution.js'
import type { ExecutionAttempt } from './attempt.js'
import type { ExecutionEvent } from './events.js'
import type { JsonObject } from './messaging.js'

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
export interface ExecutionRepositories {
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

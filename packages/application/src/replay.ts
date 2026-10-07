import {
  createExecution,
  createExecutionRequest,
  createBudgetPolicy,
  ExecutionEventType,
  ExecutionStatus,
  ReplayMode,
  isTerminal,
  type Execution,
  type ExecutionStore,
} from '@afr/domain'
import { ApplicationError } from './errors.js'
import {
  append,
  providerRequest,
  systemRuntime,
  type ProviderRegistry,
  type Runtime,
} from './runtime.js'
import type { ExecutionOrchestrator } from './orchestrator.js'

export interface ReplayOptions {
  readonly mode: ReplayMode
  readonly scenario?: string
  readonly carryBudget?: boolean
}
export class ReplayService {
  public constructor(
    private readonly store: ExecutionStore,
    private readonly providers: ProviderRegistry,
    private readonly orchestrator: ExecutionOrchestrator,
    private readonly runtime: Runtime = systemRuntime,
  ) {}
  public async replay(id: string, options: ReplayOptions): Promise<Execution> {
    if (!Object.values(ReplayMode).includes(options.mode))
      throw new ApplicationError('INVALID_REQUEST', 'Unsupported replay mode')
    const original = await this.store.getExecution(id)
    if (original === undefined) throw new ApplicationError('NOT_FOUND', 'Execution is missing')
    const { idempotencyKey: _key, ...source } = original.request
    const request = createExecutionRequest({
      ...source,
      provider: options.mode === ReplayMode.SIMULATION ? 'mock' : source.provider,
      input:
        options.mode === ReplayMode.SIMULATION
          ? { ...source.input, scenario: options.scenario ?? 'success' }
          : source.input,
      budgetPolicy:
        options.carryBudget === false
          ? createBudgetPolicy({
              maxAttempts: 3,
              maxCostUsd: 1,
              maxDurationSeconds: 60,
              maxToolCalls: 10,
            })
          : source.budgetPolicy,
    })
    const execution = createExecution(this.runtime.id(), request, this.runtime.now(), {
      originalExecutionId: id,
      replayMode: options.mode,
    })
    const validation = await this.providers
      .get(request.provider)
      .validateRequest(providerRequest(execution, 1))
    if (!validation.valid)
      throw new ApplicationError('INVALID_REQUEST', 'Provider rejected replay request')
    await this.store.transaction(id, async (tx) => {
      const locked = await tx.getExecution(id)
      if (locked === undefined) throw new ApplicationError('NOT_FOUND', 'Execution is missing')
      if (!isTerminal(locked.status) && locked.status !== ExecutionStatus.FAILED)
        throw new ApplicationError('CONFLICT', 'Replay requires a terminal execution')
      await tx.createExecution(execution)
      await append(
        tx,
        execution.id,
        ExecutionEventType.EXECUTION_CREATED,
        {
          agentId: request.agentId,
          provider: request.provider,
          operation: request.operation,
          budgetPolicy: request.budgetPolicy,
          originalExecutionId: id,
        },
        this.runtime,
      )
      await append(
        tx,
        execution.id,
        ExecutionEventType.EXECUTION_REPLAYED,
        {
          originalExecutionId: id,
          replayExecutionId: execution.id,
          replayMode: options.mode,
        },
        this.runtime,
      )
      await tx.createReplayRelationship({
        id: this.runtime.id(),
        originalExecutionId: id,
        replayExecutionId: execution.id,
        replayMode: options.mode,
        createdAt: this.runtime.now(),
      })
      await tx.createAuditRecord({
        id: this.runtime.id(),
        executionId: execution.id,
        action: 'execution.replayed',
        timestamp: this.runtime.now(),
        metadata: { originalExecutionId: id, mode: options.mode },
      })
    })
    await this.orchestrator.queue(execution.id)
    const queued = await this.store.getExecution(execution.id)
    if (queued === undefined) throw new ApplicationError('NOT_FOUND', 'Replay execution is missing')
    return queued
  }
}

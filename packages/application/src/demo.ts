import type { Execution } from '@afr/domain'
import { ApplicationError } from './errors.js'
import type { ExecutionOrchestrator } from './orchestrator.js'
export const demoScenarios = [
  {
    id: 'success',
    title: 'Successful Execution',
    description: 'Persist a successful mock response and private artifact.',
    operation: 'success',
  },
  {
    id: 'transient_failure',
    title: 'Transient Failure',
    description: 'Fail once, schedule backoff, then succeed on attempt two.',
    operation: 'transient_failure',
  },
  {
    id: 'rate_limit',
    title: 'Rate Limited',
    description: 'Honor a simulated Retry-After hint and recover.',
    operation: 'rate_limit',
  },
  {
    id: 'timeout',
    title: 'Timeout',
    description: 'Simulated timeout failures exhaust the bounded retry policy.',
    operation: 'timeout',
  },
  {
    id: 'budget_exceeded',
    title: 'Budget Exceeded',
    description: 'A synthetic measured charge crosses a $0.01 budget.',
    operation: 'budget_overrun',
  },
  {
    id: 'budget_warning',
    title: 'Budget Warning',
    description: 'An estimate reaches 80% of the cost limit before succeeding.',
    operation: 'success',
  },
  {
    id: 'permanent_failure',
    title: 'Permanent Failure',
    description: 'A non-retryable provider failure is dead-lettered immediately.',
    operation: 'permanent_failure',
  },
  {
    id: 'dead_letter',
    title: 'Dead Letter',
    description: 'Repeated failures exhaust three attempts and retain immutable history.',
    operation: 'dead_letter',
  },
  {
    id: 'replay',
    title: 'Replay',
    description: 'Create a successful source, then replay it into a new simulation execution.',
    operation: 'success',
  },
  {
    id: 'cancellation',
    title: 'Cancellation',
    description: 'A slow mock response gives time to cancel from execution detail.',
    operation: 'cancellation',
  },
] as const
export class DemoLab {
  public constructor(private readonly orchestrator: ExecutionOrchestrator) {}
  public async run(id: string): Promise<{ execution: Execution; followupReplay: boolean }> {
    const scenario = demoScenarios.find((s) => s.id === id)
    if (scenario === undefined)
      throw new ApplicationError('INVALID_REQUEST', 'Unknown demo scenario')
    const result = await this.orchestrator.create({
      agentId: 'demo-lab',
      provider: 'mock',
      operation: scenario.operation,
      input: {
        scenario: scenario.operation,
        ...(id === 'budget_warning' ? { estimatedCostUsd: 0.008 } : {}),
        ...(id === 'cancellation' ? { delayMs: 5000 } : {}),
      },
      budgetPolicy: {
        maxCostUsd: ['budget_exceeded', 'budget_warning'].includes(id) ? 0.01 : 0.1,
        maxDurationSeconds: 60,
        maxAttempts: 3,
        maxToolCalls: 10,
      },
      metadata: { demo: true, scenario: id, costsAreSynthetic: true },
    })
    return { execution: result.execution, followupReplay: id === 'replay' }
  }
}

import { z } from 'zod'
import { ExecutionStatus, ReplayMode, type Execution } from '@afr/domain'
export const defaults = {
  max_cost_usd: 1,
  max_duration_seconds: 60,
  max_attempts: 3,
  max_tool_calls: 10,
}
export const budgetSchema = z
  .object({
    max_cost_usd: z.number().finite().min(0).max(100).optional(),
    max_duration_seconds: z.number().positive().max(3600).optional(),
    max_attempts: z.number().int().min(1).max(10).optional(),
    max_tool_calls: z.number().int().min(1).max(100).optional(),
  })
  .strict()
export const createSchema = z
  .object({
    agent_id: z.string().trim().min(1).max(128),
    provider: z.enum(['mock', 'sapiom']).default('mock'),
    operation: z.string().trim().min(1).max(128),
    input: z.record(z.unknown()),
    budget_policy: budgetSchema.default(defaults),
    idempotency_key: z
      .string()
      .regex(/^[A-Za-z0-9._:-]{1,128}$/)
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
export const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    status: z.nativeEnum(ExecutionStatus).optional(),
  })
  .strict()
export const idSchema = z.object({ id: z.string().uuid() })
export const replaySchema = z
  .object({
    mode: z.nativeEnum(ReplayMode).default(ReplayMode.SIMULATION),
    scenario: z.string().min(1).max(64).optional(),
    carry_budget: z.boolean().default(true),
  })
  .strict()
export function executionDto(execution: Execution): Record<string, unknown> {
  return {
    id: execution.id,
    status: execution.status,
    agent_id: execution.request.agentId,
    provider: execution.request.provider,
    operation: execution.request.operation,
    created_at: execution.createdAt.toISOString(),
    updated_at: execution.updatedAt.toISOString(),
    original_execution_id: execution.originalExecutionId ?? null,
    replay_mode: execution.replayMode ?? null,
    budget_policy: snake(execution.request.budgetPolicy),
  }
}
// Input and artifact contents are opaque user JSON and are never transformed.
export function snake(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(snake)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        k === 'payload' || k === 'content' || k === 'metadata' ? v : snake(v),
      ]),
    )
  return value
}
export function requestDto(value: z.infer<typeof createSchema>): Record<string, unknown> {
  const b = value.budget_policy
  return {
    agentId: value.agent_id,
    provider: value.provider,
    operation: value.operation,
    input: value.input,
    budgetPolicy: {
      maxCostUsd: b.max_cost_usd,
      maxDurationSeconds: b.max_duration_seconds,
      maxAttempts: b.max_attempts,
      maxToolCalls: b.max_tool_calls,
    },
    ...(value.idempotency_key === undefined ? {} : { idempotencyKey: value.idempotency_key }),
    ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
  }
}

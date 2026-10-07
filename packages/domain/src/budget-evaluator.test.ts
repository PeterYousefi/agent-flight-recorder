import { describe, expect, it } from 'vitest'

import {
  InvalidBudgetPolicyError,
  canContinueDuration,
  canSpend,
  canStartAttempt,
  canStartToolCall,
  createBudgetPolicy,
  evaluateBudget,
} from './index.js'

const policy = createBudgetPolicy({
  maxCostUsd: 1,
  maxDurationSeconds: 100,
  maxAttempts: 3,
  maxToolCalls: 5,
})

const usage = {
  estimatedCostUsd: 0,
  attempts: 0,
  elapsedSeconds: 0,
  toolCalls: 0,
}

describe('budget evaluation', () => {
  it('allows usage below warning thresholds', () => {
    const evaluation = evaluateBudget(policy, {
      ...usage,
      estimatedCostUsd: 0.79,
      elapsedSeconds: 79,
      attempts: 1,
      toolCalls: 3,
    })

    expect(evaluation.allowed).toBe(true)
    expect(evaluation.warnings).toHaveLength(0)
    expect(evaluation.violations).toHaveLength(0)
  })

  it('returns warnings at the named 80 percent threshold', () => {
    const evaluation = evaluateBudget(policy, {
      ...usage,
      estimatedCostUsd: 0.8,
      elapsedSeconds: 80,
      attempts: 2,
      toolCalls: 4,
    })

    expect(evaluation.allowed).toBe(true)
    expect(evaluation.warnings.map(({ dimension }) => dimension)).toEqual([
      'cost',
      'duration',
      'tool_calls',
    ])
  })

  it('returns all simultaneous violations in deterministic dimension order', () => {
    const evaluation = evaluateBudget(policy, {
      estimatedCostUsd: 1.1,
      measuredCostUsd: 1.2,
      attempts: 4,
      elapsedSeconds: 101,
      toolCalls: 6,
    })

    expect(evaluation.allowed).toBe(false)
    expect(evaluation.violations.map(({ dimension }) => dimension)).toEqual([
      'cost',
      'duration',
      'attempts',
      'tool_calls',
    ])
  })

  it('distinguishes estimated from measured cost and enforces measured overrun', () => {
    const evaluation = evaluateBudget(policy, {
      ...usage,
      estimatedCostUsd: 0.2,
      measuredCostUsd: 1.01,
    })

    expect(evaluation.violations[0]).toMatchObject({
      dimension: 'cost',
      usage: 1.01,
      reason: 'limit_exceeded',
    })
  })

  it('uses integer micro-dollars for projected cost boundaries', () => {
    const below = canSpend(
      policy,
      { ...usage, estimatedCostUsd: 0.1 },
      { estimatedAdditionalCostUsd: 0.2 },
    )
    const exact = canSpend(
      policy,
      { ...usage, estimatedCostUsd: 0.1 },
      { estimatedAdditionalCostUsd: 0.9 },
    )
    const over = canSpend(
      policy,
      { ...usage, estimatedCostUsd: 0.1 },
      { estimatedAdditionalCostUsd: 0.900001 },
    )

    expect(below.kind).toBe('ALLOW')
    expect(exact.kind).toBe('WARN')
    expect(over.kind).toBe('DENY')
  })

  it('distinguishes current count validity from permission for the next operation', () => {
    expect(evaluateBudget(policy, { ...usage, attempts: 3 }).violations[0]).toMatchObject({
      dimension: 'attempts',
      reason: 'limit_reached',
    })
    expect(canStartAttempt(policy, { ...usage, attempts: 2 }).kind).toBe('WARN')
    expect(canStartAttempt(policy, { ...usage, attempts: 3 })).toMatchObject({
      kind: 'DENY',
      observation: { dimension: 'attempts', usage: 4 },
    })
    expect(canStartToolCall(policy, { ...usage, toolCalls: 4 }).kind).toBe('WARN')
    expect(canStartToolCall(policy, { ...usage, toolCalls: 5 })).toMatchObject({
      kind: 'DENY',
      observation: { dimension: 'tool_calls', usage: 6 },
    })
  })

  it('checks observed and projected duration deterministically', () => {
    expect(canContinueDuration(policy, { ...usage, elapsedSeconds: 99 }, 0).kind).toBe('WARN')
    expect(canContinueDuration(policy, { ...usage, elapsedSeconds: 90 }, 10).kind).toBe('WARN')
    expect(canContinueDuration(policy, { ...usage, elapsedSeconds: 90 }, 11).kind).toBe('DENY')
  })

  it('allows dimensions that are not configured', () => {
    const evaluation = evaluateBudget(createBudgetPolicy({}), usage)

    expect(evaluation).toEqual({ allowed: true, warnings: [], violations: [] })
    expect(canStartAttempt(createBudgetPolicy({}), usage)).toEqual({ kind: 'ALLOW' })
  })

  it('returns immutable serializable decisions', () => {
    const evaluation = evaluateBudget(policy, { ...usage, estimatedCostUsd: 0.8 })
    const decision = canStartToolCall(policy, { ...usage, toolCalls: 4 })

    expect(Object.isFrozen(evaluation)).toBe(true)
    expect(Object.isFrozen(evaluation.warnings)).toBe(true)
    expect(Object.isFrozen(decision)).toBe(true)
    expect(JSON.parse(JSON.stringify(evaluation))).toEqual(evaluation)
  })

  it.each([
    { estimatedCostUsd: -1, attempts: 0, elapsedSeconds: 0, toolCalls: 0 },
    { estimatedCostUsd: Number.NaN, attempts: 0, elapsedSeconds: 0, toolCalls: 0 },
    { estimatedCostUsd: Number.POSITIVE_INFINITY, attempts: 0, elapsedSeconds: 0, toolCalls: 0 },
    { estimatedCostUsd: 0, attempts: -1, elapsedSeconds: 0, toolCalls: 0 },
    { estimatedCostUsd: 0, attempts: 0.5, elapsedSeconds: 0, toolCalls: 0 },
    { estimatedCostUsd: 0, attempts: 0, elapsedSeconds: -1, toolCalls: 0 },
    { estimatedCostUsd: 0, attempts: 0, elapsedSeconds: 0, toolCalls: -1 },
    { estimatedCostUsd: 0, attempts: 0, elapsedSeconds: 0, toolCalls: 0.5 },
  ])('rejects invalid usage %o', (invalidUsage) => {
    expect(() => evaluateBudget(policy, invalidUsage)).toThrow(InvalidBudgetPolicyError)
  })

  it('rejects invalid warning thresholds', () => {
    expect(() => evaluateBudget(policy, usage, 0)).toThrow(InvalidBudgetPolicyError)
    expect(() => evaluateBudget(policy, usage, 1.1)).toThrow(InvalidBudgetPolicyError)
  })
})

describe('budget policy validation', () => {
  it.each([
    ['maxCostUsd', -1],
    ['maxCostUsd', Number.NaN],
    ['maxCostUsd', Number.POSITIVE_INFINITY],
    ['maxAttempts', 0],
    ['maxAttempts', 1.5],
    ['maxDurationSeconds', 0],
    ['maxDurationSeconds', -1],
    ['maxToolCalls', 0],
    ['maxToolCalls', -1],
    ['maxToolCalls', 1.5],
  ] as const)('rejects invalid %s value %s', (field, value) => {
    expect(() => createBudgetPolicy({ [field]: value })).toThrow(InvalidBudgetPolicyError)
  })
})

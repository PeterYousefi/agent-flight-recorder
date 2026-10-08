---
inclusion: always
---

# Agent Flight Recorder — Product Context

## What It Is

Agent Flight Recorder is a **local-first execution control plane** for observable, replayable, cost-aware AI agent workloads. It wraps the execution lifecycle of AI agents — particularly those invoking external tools, APIs, models, sandboxes, or cloud resources — with production-grade infrastructure primitives.

The name is deliberate. Like an aircraft flight recorder, this system captures everything that happened during an agent's execution: every tool call, every state transition, every retry decision, every cost event. When something goes wrong, you can inspect it. When you want to understand what happened, you can replay it.

## Target Users

- Platform engineers building agent infrastructure
- Backend engineers integrating AI agents into production systems
- Infrastructure engineers evaluating reliability patterns for agentic workloads
- Anyone operating AI agents at scale who cares about observability, cost, and failure handling

## Why It Exists

AI agent frameworks (including Sapiom) excel at defining and running agent logic. What they do not typically expose as a composable layer is:

- durable execution state with inspectable history
- structured event capture across async boundaries
- per-execution cost budgets with enforcement
- retry policies with idempotency guarantees
- dead-letter handling for permanently failed executions
- deterministic replay for incident investigation
- OpenTelemetry traces spanning agent → tool → result
- a dashboard showing operational health across all executions

Agent Flight Recorder provides exactly this control and observability layer. It sits _around_ agent execution, not inside it.

## Relationship to Sapiom

AFR integrates the verified Sapiom Router chat-completions API behind `ExecutionProvider`. The adapter is optional and disabled by default. AFR owns its local durable history, retries, budgets and observability. Do not infer limitations of Sapiom's broader platform from this narrow integration. See `docs/integrations/sapiom.md` for verified scope and limitations.

## Portfolio Goal

This repository exists to demonstrate production engineering judgment around AI agent infrastructure. It should be the kind of project that a senior platform engineer would build to understand and operate an agentic system before relying on it in production.

The goal is not to build the most features. The goal is to build the right features correctly and demonstrate real tradeoff decisions.

## Reliability Philosophy

- Failures are expected. Execution infrastructure must handle them gracefully.
- Every failure should be inspectable, not just logged.
- Retries must be intentional, not naive.
- Costs must be tracked and bounded. Unbounded agent spend is an operational risk.
- Replay must be safe. Replaying an execution must never corrupt the original record.
- Observability is not optional. Traces, metrics, and structured logs must be present from day one.
- Local-first means the system must be fully demonstrable without Azure credentials, Sapiom credentials, or cloud costs.

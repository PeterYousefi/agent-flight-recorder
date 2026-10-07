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

Sapiom is an execution engine and capability network for AI agents. It provides:

- a typed agent authoring SDK (`@sapiom/agent`)
- a capability client for invoking tools (`@sapiom/tools`)
- a deployment and scheduling CLI (`@sapiom/cli`)
- a model router

Sapiom does **not** currently expose a public API for:

- querying execution status and history
- tracking per-execution costs in a structured, queryable way
- defining budget policies that block or stop executions
- replaying historical executions
- inspecting dead-lettered or permanently failed work
- emitting OpenTelemetry traces across async execution boundaries
- providing a dashboard for operational oversight

Agent Flight Recorder complements Sapiom by providing exactly these missing layers. The `SapiomProvider` adapter wraps `@sapiom/tools` calls so that every invocation flows through the control plane, gaining durability, observability, and cost awareness that Sapiom itself does not offer at the API level.

This is additive infrastructure, not competition.

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

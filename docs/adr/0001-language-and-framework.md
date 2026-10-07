# ADR 0001 — Language and Framework Selection

**Date:** 2026-10-06  
**Status:** Accepted

## Context

Agent Flight Recorder needs a backend language and framework for:

- A REST API serving execution management operations
- An async worker consuming a message queue and invoking execution providers
- Shared domain logic (state machine, event schemas, budget policies)
- Integration with the Sapiom SDK

The two credible options were **Python 3.12+ with FastAPI** and **TypeScript with Node.js**.

## Decision

**TypeScript (strict) with Node.js 22 LTS.**

API: **Fastify** with `@fastify/swagger` for OpenAPI.  
ORM: **Prisma** with PostgreSQL.  
Worker: standalone Node.js process, no framework overhead.  
Monorepo: **pnpm workspaces** with shared `packages/`.  
Test runner: **Vitest** (fast, native ESM, compatible with the pnpm workspace setup).  
Linter: **ESLint** with `@typescript-eslint`.  
Formatter: **Prettier**.

## Rationale

### Sapiom SDK is TypeScript-first

Sapiom's public SDK (`@sapiom/agent`, `@sapiom/tools`, `@sapiom/cli`) is authored in TypeScript and published to npm. Consuming these packages from TypeScript gives:

- Native type checking against SDK interfaces — no stubs or type generation required
- Shared type definitions between our domain model and provider adapters
- Identical toolchain across all layers (lint, format, typecheck, test)

Using Python would require either stub generation or untyped HTTP calls against Sapiom's HTTP API, neither of which demonstrates the SDK integration story as cleanly.

### Single language across the stack

With TypeScript in `apps/api`, `apps/worker`, `apps/web`, and `packages/domain`, types flow without serialization boundaries. A domain type defined in `packages/domain` is used directly in the API route handler, worker, and React frontend without conversion.

### Fastify over Express or NestJS

- Fastify has first-class async support, built-in schema validation, and a plugin system that keeps concerns separated without requiring a full framework commitment.
- NestJS adds significant framework overhead and opinionated patterns that would obscure the domain logic — the opposite of what this project wants to demonstrate.
- Express is not meaningfully maintained for new TypeScript projects.

### Vitest over Jest

- Native ESM support without `babel-jest` configuration.
- Compatible with pnpm workspaces without special setup.
- Fast enough that the watch → commit loop feels tight.

### Prisma over raw SQL or Knex

- Prisma's migration system is explicit and auditable — each migration is a committed SQL file.
- The generated client provides strong typing without manual query typing.
- Schema-first design forces deliberate column and index decisions, which is a portfolio positive.

## Rejected Alternatives

**Python / FastAPI:**  
Would be a reasonable choice for a pure backend service. Loses the native Sapiom SDK integration and forces cross-language complexity in a monorepo. Python's async story (asyncio, uvloop) is mature but the toolchain fragmentation (poetry vs pip vs pyenv) adds friction for a public portfolio repo.

**Go:**  
Excellent concurrency primitives and performance characteristics for a worker. However, no official Sapiom SDK exists for Go. The integration would be HTTP-level only, which weakens the portfolio story.

**NestJS:**  
The decorator-heavy DI system obscures domain logic behind framework magic. Difficult to demonstrate clean dependency inversion when the framework owns the container.

## Consequences

- All contributors need TypeScript familiarity.
- pnpm workspace management adds some monorepo complexity but is well-understood.
- Node.js is single-threaded; CPU-bound work in the worker must be offloaded or time-boxed. This project's workloads are I/O-bound (provider calls, DB writes), so this is acceptable.
- Fastify's plugin system requires discipline to keep plugins focused — documented in engineering standards.

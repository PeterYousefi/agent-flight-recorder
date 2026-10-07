---
inclusion: always
---

# Engineering Standards

## TypeScript

- `strict: true` in every `tsconfig.json`. No exceptions.
- No `any` without an explicit comment explaining why it cannot be avoided.
- All public function signatures have explicit return types.
- Use `unknown` instead of `any` for externally-sourced data, then narrow.
- Prefer `type` for unions/intersections, `interface` for object shapes that may be extended.
- Enums only for domain state values (execution status, event types). Avoid `const enum` for cross-package compatibility.

## Interfaces and Dependency Inversion

- Core domain logic (`packages/domain`) never imports from `apps/` or infrastructure packages.
- I/O boundaries (DB, queue, storage, HTTP) are expressed as interfaces in `domain/`, implemented in `apps/` or `packages/`.
- The `ExecutionProvider` interface is the boundary between the control plane and external agents/tools.
- The `MessageBus` interface is the boundary between application logic and the queue transport.
- The `ArtifactStore` interface is the boundary between application logic and object storage.
- Constructor injection over service locators. If you cannot test a class without a real database, you have a design problem.

## Error Handling

- No swallowed exceptions. Every `catch` block either re-throws, transforms into a typed error, or explicitly logs and continues with documented reason.
- Define typed error classes for domain errors: `BudgetExceededError`, `ExecutionNotFoundError`, `InvalidStateTransitionError`, etc.
- API responses must never expose raw stack traces, internal exception messages, or database error details.
- Use the standard API error shape: `{ error: { code, message, request_id, details } }`.
- Retryable vs non-retryable errors must be explicitly classified. Workers must not retry permanently failed operations.

## Logging

- Structured JSON logging everywhere. No `console.log` in production paths.
- Every log entry must include: `level`, `message`, `timestamp`, `service`, `execution_id` (when in execution context), `trace_id` (when available).
- Sensitive values (API keys, tokens, payloads marked as sensitive) must be redacted before logging.
- Do not log full request/response bodies by default. Log payload hashes or truncated summaries.
- Use log levels correctly: `debug` for development tracing, `info` for significant state changes, `warn` for recoverable anomalies, `error` for failures requiring attention.

## Correlation and Tracing

- Every HTTP request must receive a `request_id` (generated or from `X-Request-Id` header).
- Every execution carries an `execution_id` that flows through all logs, events, and spans.
- OTel trace context must propagate across the HTTP → message queue → worker boundary using message attributes.
- Never start a new root span inside the worker when a parent context was propagated from the API.

## Input Validation

- Validate all incoming HTTP request bodies with Zod schemas at the API boundary.
- Never trust queue message payloads without validation — messages may be malformed or from old schema versions.
- Validate provider responses before persisting. Use `normalizeResult()` on every provider output.

## Testing

- Every state machine transition has a unit test.
- Every budget policy has a unit test for the enforcement boundary.
- Every retry decision (retryable vs non-retryable) has a unit test.
- Integration tests use real PostgreSQL (via Docker in CI) and the in-memory message bus.
- No test may pass by asserting on a mock when it should assert on real behavior.
- Property-based tests for idempotency invariants and state machine transitions where practical.
- Test file naming: `*.test.ts` for unit, `*.integration.test.ts` for integration.

## Database

- Use Prisma migrations exclusively. Never use `prisma db push` or `createAll()` in production paths.
- Every migration file is committed. Migration history is part of the repository.
- Add indexes explicitly — do not rely on Prisma to choose them.
- Query patterns determine indexes, not assumptions.

## Security

- No secrets in source code. No secrets in environment variable defaults that are real values.
- `.env` is in `.gitignore`. `.env.example` contains only placeholder values.
- Use `REDACTED` or `your-value-here` in `.env.example`, never real credentials.
- Dependency updates should be reviewed, not blindly merged. Dependabot PRs require human review.
- HTTP security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` (production), `Content-Security-Policy`.

## Naming

- Use domain language in names. An `Execution` is not a `Job` or a `Task` internally.
- `snake_case` for database columns and JSON API fields. `camelCase` for TypeScript identifiers. `PascalCase` for types and classes.
- Event type strings use `noun.verb_past` format: `execution.created`, `tool.succeeded`, `budget.exceeded`.
- Error codes are `SCREAMING_SNAKE_CASE`: `BUDGET_EXCEEDED`, `EXECUTION_NOT_FOUND`.

## Git and Commits

- Conventional Commits format: `type(scope): description`.
- One completed engineering unit per commit. Do not accumulate multiple features.
- No knowingly broken code on `main`.
- Run the full validation suite before committing a milestone (format → lint → typecheck → test).
- See `.kiro/steering/git-workflow.md` for the complete workflow.

## Code Organization

- Keep files focused. A file longer than ~400 lines is a signal to reconsider boundaries.
- Co-locate tests with source (`src/foo.ts` + `src/foo.test.ts`) or in a parallel `tests/` directory — choose one per package and be consistent.
- Export only what needs to be exported. Minimize public API surface of each package.

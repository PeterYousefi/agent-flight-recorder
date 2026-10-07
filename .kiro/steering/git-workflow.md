---
inclusion: always
---

# Git Workflow

## Commit Discipline

Git history is a portfolio artifact. Every commit must tell a coherent story to someone reading the log cold.

### Conventional Commit Format

```
type(scope): short description

Optional body explaining the why, not the what.
```

**Types:** `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `perf`

**Scopes match the component:** `domain`, `api`, `worker`, `web`, `providers`, `observability`, `infra`, `ci`, `deps`

### Examples

```
feat(domain): implement execution state machine with valid transition enforcement
feat(api): add POST /executions endpoint with idempotency support
feat(worker): add exponential backoff retry with jitter
feat(providers): implement MockProvider with failure injection scenarios
feat(cost): add BudgetPolicy enforcement with budget.exceeded events
feat(replay): implement simulation replay mode via MockProvider override
test(domain): add property-based tests for state machine invariants
fix(worker): handle nack correctly on non-retryable provider errors
docs(adr): record replay semantics decision
ci: add GitHub Actions workflow for type check and unit tests
```

## The Commit Checklist

Before every commit at a completed milestone:

1. `pnpm format` — format all changed files
2. `pnpm lint` — zero lint errors
3. `pnpm typecheck` — zero type errors
4. `pnpm test` (relevant scope) — all tests pass
5. `git diff --check` — no whitespace errors
6. Scan diff for secrets: API keys, tokens, connection strings with passwords, private keys
7. `git status` — confirm only intended files are staged
8. `git add <specific files>` — never `git add .` blindly
9. `git commit -m "type(scope): description"`
10. `git push origin HEAD`
11. Verify push succeeded

## Branch Strategy

- `main` is always deployable. No broken code on `main`.
- Feature work happens on `main` during solo portfolio development (acceptable for this context).
- If a milestone is incomplete or tests fail, do not push until fixed.

## What Never Gets Committed

- `.env` files
- Any file containing real API keys, tokens, or passwords
- `*.pem`, `*.key`, `*.p12`, `*.pfx` certificate/key files
- `node_modules/`
- Build output (`dist/`, `.next/`, `build/`)
- IDE-specific files not in `.gitignore` already
- Prisma migration lock files that haven't been reviewed

## Commit Granularity

One coherent engineering unit = one commit. Examples of appropriate units:

- Execution state machine + tests
- Prisma schema + initial migration
- API endpoint + validation + error handling (one endpoint)
- Worker message consumer + retry logic
- Provider interface + MockProvider implementation
- CI workflow file
- A complete ADR document

Do not accumulate ten features and push once. Do not commit after every keystroke.

## Pushing

Always push immediately after a successful commit:

```bash
git push origin HEAD
```

Verify the push succeeded before marking a task complete.

## Secret Detection

Before pushing, run a quick manual scan:

```bash
git diff HEAD~1 | grep -iE "(api[_-]?key|secret|password|token|credential)" | grep -v ".example"
```

If gitleaks is available:

```bash
gitleaks detect --source . --no-git
```

The CI pipeline also runs secret scanning on every push.

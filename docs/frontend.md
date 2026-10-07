# Operations console

The Lovable export supplied the charcoal/indigo design system, compact tables, sidebar, typography, timeline and graph components. The production frontend is the existing `apps/web` React/Vite application. TanStack Router generates its route tree; the executions layout renders an Outlet for both the list and detail routes. TanStack Query polls the API and aborts superseded reads.

No production page imports fixture data. PostgreSQL computes overview aggregates and bulk per-execution attempt/cost summaries; pagination does not change totals. Unknown costs remain unknown. Mock demo costs are synthetic. The browser adapts snake_case API contracts to presentation models without changing domain semantics.

The export's server-side TanStack Start/Nitro layer, Lovable helper plugin, unused UI primitives and duplicate workspace configuration are not runtime dependencies. Git history preserves the reference. No export environment file is imported.

Run the complete local environment with `pnpm demo`. With it running, install the test browser using `pnpm --filter @afr/web exec playwright install chromium`, then run `pnpm --filter @afr/web exec playwright test`. These tests exercise the real local API rather than intercepted fixture responses.

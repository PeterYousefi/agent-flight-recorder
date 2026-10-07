# Operations console conventions

Preserve published Git history; do not force-push or rewrite pushed commits. The Lovable console is the visual reference preserved in Git history. Keep its dark design system, compact operational layout, semantic status colors and responsive navigation.

Production pages use the AFR API and centralized projections in `src/lib/data.ts`; do not introduce fabricated executions, metrics, traces or actions. Keep unavailable values explicit. Tests may use isolated fixtures.

`src/routes/executions.tsx` is a layout that renders only `<Outlet />`; its children are `executions.index.tsx` and `executions.$id.tsx`. The router generates `routeTree.gen.ts`; do not hand-edit it.

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- All console mock data lives in `src/lib/mock-data.ts`; pages and components import from it, never define their own fixtures. Why: keeps executions, timelines, and metrics consistent across all seven screens.
- `src/routes/executions.tsx` is a layout route that only renders `<Outlet />`; the table page is `executions.index.tsx`. Why: TanStack Router promotes a route file to a layout when a child (`executions.$id.tsx`) exists, and children never mount without an outlet.

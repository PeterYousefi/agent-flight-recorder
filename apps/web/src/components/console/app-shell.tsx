import type { JSX } from 'react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  FlaskConical,
  Github,
  LayoutDashboard,
  ListTree,
  Search,
  Settings,
  Skull,
} from 'lucide-react'
import { Command } from 'cmdk'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { request, type ExecutionDto, type Page } from '@/lib/api'
import { project } from '@/lib/data'
import { StatusDot } from './status-badge'

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/executions', label: 'Executions', icon: ListTree },
  { to: '/dead-letter', label: 'Dead Letter', icon: Skull },
  { to: '/demo-lab', label: 'Demo Lab', icon: FlaskConical },
  { to: '/observability', label: 'Observability', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element | null {
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['palette'],
    queryFn: ({ signal }) => request<Page<ExecutionDto>>('/executions?limit=8', { signal }),
    enabled: open,
  })
  const executions = query.data?.items.map((e) => project(e)) ?? []
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    return () => {
      requestAnimationFrame(() => document.getElementById('console-search')?.focus())
    }
  }, [open])

  if (!open) return null

  const go = (to: string, params?: Record<string, string>): void => {
    onOpenChange(false)
    void navigate({ to, params } as never)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 pt-[18vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <Command.Dialog
        open={open}
        onOpenChange={onOpenChange}
        className="w-full max-w-lg overflow-hidden rounded-md border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-3.5 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Search recent executions or pages…"
            className="h-10 w-full bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded-sm border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <Command.List className="max-h-72 overflow-auto p-1.5">
          <Command.Empty className="py-6 text-center font-mono text-xs text-muted-foreground">
            No results.
          </Command.Empty>
          <Command.Group
            heading={
              <span className="px-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                Pages
              </span>
            }
          >
            {nav.map((n) => (
              <Command.Item
                key={n.to}
                value={`page ${n.label}`}
                onSelect={() => go(n.to)}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground data-[selected=true]:bg-accent"
              >
                <n.icon className="size-3.5 text-muted-foreground" />
                {n.label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group
            heading={
              <span className="px-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                Executions
              </span>
            }
          >
            {executions.slice(0, 8).map((e) => (
              <Command.Item
                key={e.id}
                value={`${e.id} ${e.agent} ${e.provider} ${e.status}`}
                onSelect={() => go('/executions/$id', { id: e.id })}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-xs text-foreground data-[selected=true]:bg-accent"
              >
                <StatusDot status={e.status} />
                <span className="truncate">{e.id}</span>
                <span className="ml-auto font-sans text-[11px] text-muted-foreground">
                  {e.agent}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const health = useQuery({
    queryKey: ['ready'],
    queryFn: ({ signal }) => request<{ status: string }>('/ready', { signal }),
    refetchInterval: 5000,
  })
  const allOperational = health.data?.status === 'ready'

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-12 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="flex size-5 items-center justify-center rounded-sm bg-primary">
            <Activity className="size-3 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
              Agent Flight Recorder
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-auto p-2">
          {nav.map((item) => {
            const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] transition-colors',
                  active
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="space-y-2 border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between rounded-sm border border-border bg-background/50 px-2.5 py-1.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Mode
            </span>
            <span className="font-mono text-[11px] text-primary">Local · mock demos</span>
          </div>
          <div className="flex items-center justify-between rounded-sm border border-border bg-background/50 px-2.5 py-1.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Health
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  allOperational ? 'bg-success' : 'bg-warning',
                )}
              />
              <span className={allOperational ? 'text-success' : 'text-warning'}>
                {allOperational ? 'Dependencies ready' : 'Unavailable'}
              </span>
            </span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-56">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
          <button
            id="console-search"
            onClick={() => setPaletteOpen(true)}
            className="flex h-7 w-full max-w-sm items-center gap-2 rounded-sm border border-input bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
          >
            <Search className="size-3.5" />
            <span className="font-mono text-[11px]">Search or jump to…</span>
            <kbd className="ml-auto rounded-sm border border-border bg-muted px-1 py-px font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground sm:inline-flex">
              <span className="size-1.5 rounded-full bg-primary" />
              local-dev
            </span>
            <span className="hidden items-center gap-1.5 font-mono text-[11px] md:inline-flex">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  allOperational ? 'bg-success' : 'bg-warning',
                )}
              />
              <span className={allOperational ? 'text-success' : 'text-warning'}>
                {allOperational ? 'healthy' : 'degraded'}
              </span>
            </span>
            <a
              href="https://github.com/PeterYousefi/agent-flight-recorder"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="GitHub"
            >
              <Github className="size-4" />
            </a>
          </div>
        </header>

        {/* Compact nav for small screens */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {nav.map((item) => {
            const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs',
                  active
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

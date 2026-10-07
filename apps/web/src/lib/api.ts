export type Status =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING'
  | 'RETRY_SCHEDULED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'BUDGET_EXCEEDED'
  | 'DEAD_LETTERED'
export interface Budget {
  max_cost_usd?: number
  max_duration_seconds?: number
  max_attempts?: number
  max_tool_calls?: number
}
export interface ExecutionDto {
  id: string
  status: Status
  agent_id: string
  provider: string
  operation: string
  created_at: string
  updated_at: string
  original_execution_id: string | null
  replay_mode: 'input' | 'simulation' | null
  budget_policy: Budget
  summary?: {
    attempt_count: number
    estimated_micro_usd: string | null
    measured_micro_usd: string | null
  }
  attempts?: AttemptDto[]
}
export interface AttemptDto {
  id: string
  attempt_number: number
  status: string
  started_at: string
  completed_at?: string
  error_code?: string
  error_message?: string
  retryable?: boolean
}
export interface EventDto {
  event_id: string
  execution_id: string
  event_type: string
  sequence: number
  timestamp: string
  schema_version: number
  payload: Record<string, unknown>
  correlation?: { trace_id?: string; span_id?: string }
}
export interface CostDto {
  estimated_micro_usd: string | null
  measured_micro_usd: string | null
  records: {
    id: string
    attempt_id?: string
    kind: 'estimated' | 'measured'
    amount_micro_usd: string
    timestamp: string
  }[]
}
export interface ArtifactDto {
  id: string
  kind: string
  content_type: string
  size_bytes: string
  checksum?: string
  created_at: string
}
export interface DeadLetterDto {
  id: string
  execution_id: string
  reason: string
  final_attempt: number
  dead_lettered_at: string
  requeued_execution_id: string | null
}
export interface DemoDto {
  id: string
  title: string
  description: string
}
export interface OverviewDto {
  total: number
  succeeded: number
  failed: number
  cancelled: number
  budget_exceeded: number
  dead_letters: number
  retries: number
  replays: number
  tool_calls: number
  pending_outbox: number
  p50_seconds: number | null
  p95_seconds: number | null
  estimated_micro_usd: string | null
  measured_micro_usd: string | null
  hourly: { hour: string; created: number; succeeded: number; failed: number }[]
}
export interface Page<T> {
  items: T[]
  next_offset: number | null
}
const origin = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
export async function request<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${origin}/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal:
        options.signal === undefined
          ? AbortSignal.timeout(15000)
          : AbortSignal.any([options.signal, AbortSignal.timeout(15000)]),
    })
  } catch {
    throw new ApiError(
      0,
      'UNAVAILABLE',
      'The local API is unavailable. Start pnpm demo and try again.',
    )
  }
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null)
    const code =
      typeof value === 'object' &&
      value !== null &&
      'error' in value &&
      typeof value.error === 'object' &&
      value.error !== null &&
      'code' in value.error &&
      typeof value.error.code === 'string'
        ? value.error.code
        : 'REQUEST_FAILED'
    throw new ApiError(
      response.status,
      code,
      response.status === 409
        ? 'This action conflicts with the current execution state. Refresh and try again.'
        : response.status === 404
          ? 'The requested execution or artifact was not found.'
          : 'The API could not complete this request.',
    )
  }
  return response.json() as Promise<T>
}
export async function allEvents(id: string, signal?: AbortSignal): Promise<EventDto[]> {
  const events: EventDto[] = []
  let offset: number | null = 0
  while (offset !== null) {
    const page: Page<EventDto> = await request(
      `/executions/${id}/events?limit=100&offset=${offset}`,
      signal === undefined ? {} : { signal },
    )
    events.push(...page.items)
    offset = page.next_offset
    if (events.length > 5000)
      throw new ApiError(
        0,
        'TOO_MANY_EVENTS',
        'This history exceeds the browser event limit. Use the paginated API.',
      )
  }
  return events
}
export async function detail(
  id: string,
  signal?: AbortSignal,
): Promise<{
  execution: ExecutionDto
  events: EventDto[]
  cost: CostDto
  artifacts: ArtifactDto[]
}> {
  const options = signal === undefined ? {} : { signal }
  const [execution, events, cost, artifacts] = await Promise.all([
    request<ExecutionDto>(`/executions/${id}`, options),
    allEvents(id, signal),
    request<CostDto>(`/executions/${id}/cost`, options),
    request<{ items: ArtifactDto[] }>(`/executions/${id}/artifacts`, options),
  ])
  return { execution, events, cost, artifacts: artifacts.items }
}
export function terminal(status: Status): boolean {
  return ['SUCCEEDED', 'FAILED', 'CANCELLED', 'BUDGET_EXCEEDED', 'DEAD_LETTERED'].includes(status)
}

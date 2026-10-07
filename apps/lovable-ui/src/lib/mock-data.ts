// Realistic mock data for the Agent Flight Recorder console.
// Everything is deterministic so the UI looks like a live engineering product.

export type ExecutionStatus =
  | "completed"
  | "failed"
  | "running"
  | "retrying"
  | "waiting"
  | "cancelled"
  | "dead_lettered";

export type FailureType =
  | "rate_limited"
  | "timeout"
  | "budget_exceeded"
  | "tool_error"
  | "model_error";

export interface Execution {
  id: string;
  traceId: string;
  agent: string;
  provider: string;
  model: string;
  status: ExecutionStatus;
  durationMs: number;
  costUsd: number;
  attempts: number;
  maxAttempts: number;
  tools: string[];
  startedAt: string; // ISO
  failureType?: FailureType;
  failureMessage?: string;
  replayOf?: string;
  deadLetteredAt?: string;
  firstFailedAt?: string;
  finalFailedAt?: string;
}

export const AGENTS = [
  "research-agent",
  "support-copilot",
  "code-reviewer",
  "data-pipeline",
  "docs-assistant",
] as const;

export const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "azure-openai", label: "Azure OpenAI" },
  { id: "google", label: "Google" },
] as const;

export const FAILURE_TYPES: Record<FailureType, string> = {
  rate_limited: "Rate limited",
  timeout: "Timeout",
  budget_exceeded: "Budget exceeded",
  tool_error: "Tool error",
  model_error: "Model error",
};

const BASE = new Date("2026-10-07T15:58:00Z").getTime();
const min = 60_000;

function ago(minutes: number) {
  return new Date(BASE - minutes * min).toISOString();
}

export const FEATURED_EXECUTION_ID = "exec_01J9XKPM7V3Q8R2T4W6Y0ZAB";

export const executions: Execution[] = [
  {
    id: FEATURED_EXECUTION_ID,
    traceId: "trace_7f3a9c2e1b4d4f8a9e0c5b6d7e8f90a1",
    agent: "research-agent",
    provider: "openai",
    model: "gpt-5.2",
    status: "completed",
    durationMs: 14_820,
    costUsd: 0.0142,
    attempts: 2,
    maxAttempts: 3,
    tools: ["web.search", "scrape"],
    startedAt: ago(6),
  },
  {
    id: "exec_01J9XKJ8HN2P4Q6R8T0W2Y4A6C8E0G",
    traceId: "trace_2b4d6f8a0c1e3a5b7c9d0e1f2a3b4c5d",
    agent: "support-copilot",
    provider: "anthropic",
    model: "claude-sonnet-4.6",
    status: "running",
    durationMs: 3_410,
    costUsd: 0.0038,
    attempts: 1,
    maxAttempts: 3,
    tools: ["vector.query", "kb.lookup"],
    startedAt: ago(0.9),
  },
  {
    id: "exec_01J9XKG2TQ4W6Y8A0C2E4G6I8K0M2O",
    traceId: "trace_9e8d7c6b5a4938271605f4e3d2c1b0a9",
    agent: "code-reviewer",
    provider: "openai",
    model: "gpt-5.2",
    status: "retrying",
    durationMs: 8_204,
    costUsd: 0.0091,
    attempts: 2,
    maxAttempts: 3,
    tools: ["git.diff", "code.exec"],
    startedAt: ago(2),
    failureType: "rate_limited",
    failureMessage: "HTTP 429 — provider rate limit exceeded (retry-after: 2s)",
  },
  {
    id: "exec_01J9XK90ZA1B3C5D7E9F1G3H5J7L9N",
    traceId: "trace_4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d",
    agent: "data-pipeline",
    provider: "azure-openai",
    model: "gpt-5-mini",
    status: "failed",
    durationMs: 30_011,
    costUsd: 0.0064,
    attempts: 1,
    maxAttempts: 3,
    tools: ["sql.query", "http.request"],
    startedAt: ago(9),
    failureType: "timeout",
    failureMessage: "Tool sql.query exceeded execution deadline of 30000ms",
  },
  {
    id: "exec_01J9XK5FVH8J2K4L6M8N0P2Q4R6S8T",
    traceId: "trace_1c3e5a7b9d0f2a4c6e8a0c2e4f6a8b0c",
    agent: "research-agent",
    provider: "google",
    model: "gemini-3-pro",
    status: "completed",
    durationMs: 11_230,
    costUsd: 0.0118,
    attempts: 1,
    maxAttempts: 3,
    tools: ["web.search", "scrape", "pdf.extract"],
    startedAt: ago(14),
  },
  {
    id: "exec_01J9XK1QWE3R5T7Y9U1I3O5P7A9S1D",
    traceId: "trace_6f8a0b2c4d6e8f0a2c4e6a8c0e2f4a6b",
    agent: "docs-assistant",
    provider: "anthropic",
    model: "claude-haiku-4.5",
    status: "completed",
    durationMs: 2_940,
    costUsd: 0.0011,
    attempts: 1,
    maxAttempts: 3,
    tools: ["vector.query"],
    startedAt: ago(18),
  },
  {
    id: "exec_01J9XJWYUI2O4P6A8S0D2F4G6H8J0K",
    traceId: "trace_0b2d4f6a8c0e2a4c6e8a0c2e4f6a8b0d",
    agent: "support-copilot",
    provider: "openai",
    model: "gpt-5-mini",
    status: "waiting",
    durationMs: 0,
    costUsd: 0,
    attempts: 0,
    maxAttempts: 3,
    tools: [],
    startedAt: ago(21),
  },
  {
    id: "exec_01J9XJRTYU6I8O0P2A4S6D8F0G2H4J",
    traceId: "trace_3e5a7c9b1d3f5a7c9e1a3c5e7a9c1e3f",
    agent: "code-reviewer",
    provider: "anthropic",
    model: "claude-sonnet-4.6",
    status: "completed",
    durationMs: 19_660,
    costUsd: 0.0273,
    attempts: 1,
    maxAttempts: 3,
    tools: ["git.diff", "code.exec", "test.run"],
    startedAt: ago(26),
  },
  {
    id: "exec_01J9XJMNOP8Q0R2S4T6U8V0W2X4Y6Z",
    traceId: "trace_8c0e2a4c6e8a0c2e4f6a8b0d2f4a6c8e",
    agent: "data-pipeline",
    provider: "azure-openai",
    model: "gpt-5.2",
    status: "failed",
    durationMs: 4_812,
    costUsd: 0.0042,
    attempts: 3,
    maxAttempts: 3,
    tools: ["sql.query"],
    startedAt: ago(33),
    failureType: "tool_error",
    failureMessage: "sql.query: connection refused — postgres://db.internal:5432",
  },
  {
    id: "exec_01J9XJGHJK1L3M5N7P9Q1R3S5T7U9V",
    traceId: "trace_5d7f9a1c3e5a7c9e1a3c5e7a9c1e3f5a",
    agent: "research-agent",
    provider: "openai",
    model: "gpt-5.2",
    status: "completed",
    durationMs: 9_475,
    costUsd: 0.0126,
    attempts: 1,
    maxAttempts: 3,
    tools: ["web.search", "scrape"],
    startedAt: ago(41),
    replayOf: "exec_01J9XF2CVB4N6M8Q0W2E4R6T8Y0U2I4O",
  },
  {
    id: "exec_01J9XJDFGH2J4K6L8M0N2P4Q6R8S0T",
    traceId: "trace_2a4c6e8a0c2e4f6a8b0d2f4a6c8e0a2c",
    agent: "support-copilot",
    provider: "google",
    model: "gemini-3-flash",
    status: "cancelled",
    durationMs: 1_204,
    costUsd: 0.0004,
    attempts: 1,
    maxAttempts: 3,
    tools: ["kb.lookup"],
    startedAt: ago(48),
  },
  {
    id: "exec_01J9XJASDF3G5H7J9K1L3M5N7P9Q1R",
    traceId: "trace_7e9a1c3e5a7c9e1a3c5e7a9c1e3f5a7c",
    agent: "docs-assistant",
    provider: "openai",
    model: "gpt-5-mini",
    status: "completed",
    durationMs: 5_318,
    costUsd: 0.0029,
    attempts: 2,
    maxAttempts: 3,
    tools: ["vector.query", "file.read"],
    startedAt: ago(55),
  },
  {
    id: "exec_01J9XJ6ZXC4V6B8N0M2Q4W6E8R0T2Y",
    traceId: "trace_1a3c5e7a9c1e3f5a7c9e1a3c5e7a9c1e",
    agent: "code-reviewer",
    provider: "openai",
    model: "gpt-5.2",
    status: "failed",
    durationMs: 22_140,
    costUsd: 0.0198,
    attempts: 3,
    maxAttempts: 3,
    tools: ["git.diff", "code.exec"],
    startedAt: ago(64),
    failureType: "budget_exceeded",
    failureMessage: "Execution cost $0.0198 exceeded remaining budget of $0.0150",
  },
  {
    id: "exec_01J9XJ2VBN5M7Q9W1E3R5T7Y9U1I3O",
    traceId: "trace_4c6e8a0c2e4f6a8b0d2f4a6c8e0a2c4e",
    agent: "research-agent",
    provider: "anthropic",
    model: "claude-opus-4.6",
    status: "completed",
    durationMs: 31_880,
    costUsd: 0.0864,
    attempts: 1,
    maxAttempts: 3,
    tools: ["web.search", "scrape", "pdf.extract", "vector.query"],
    startedAt: ago(72),
  },
  {
    id: "exec_01J9XHZXCV6B8N0M2Q4W6E8R0T2Y4U",
    traceId: "trace_9b1d3f5a7c9e1a3c5e7a9c1e3f5a7c9e",
    agent: "data-pipeline",
    provider: "azure-openai",
    model: "gpt-5-mini",
    status: "completed",
    durationMs: 7_602,
    costUsd: 0.0051,
    attempts: 1,
    maxAttempts: 3,
    tools: ["sql.query", "storage.put"],
    startedAt: ago(85),
  },
  {
    id: "exec_01J9XHTRFG7H9J1K3L5M7N9P1Q3R5S",
    traceId: "trace_0d2f4a6c8e0a2c4e6f8a0c2e4f6a8c0e",
    agent: "support-copilot",
    provider: "openai",
    model: "gpt-5.2",
    status: "completed",
    durationMs: 4_118,
    costUsd: 0.0067,
    attempts: 1,
    maxAttempts: 3,
    tools: ["vector.query", "kb.lookup", "email.send"],
    startedAt: ago(97),
  },
  {
    id: "exec_01J9XHPYUI8O0P2A4S6D8F0G2H4J6K",
    traceId: "trace_3f5a7c9e1a3c5e7a9c1e3f5a7c9e1a3c",
    agent: "docs-assistant",
    provider: "anthropic",
    model: "claude-haiku-4.5",
    status: "failed",
    durationMs: 912,
    costUsd: 0.0002,
    attempts: 1,
    maxAttempts: 3,
    tools: ["file.read"],
    startedAt: ago(112),
    failureType: "model_error",
    failureMessage: "Provider returned 500 Internal Server Error (request_id: req_9f2k41)",
  },
  {
    id: "exec_01J9XHKLAS9D1F3G5H7J9K1L3M5N7P",
    traceId: "trace_6a8c0e2a4c6e8a0c2e4f6a8c0e2f4a6c",
    agent: "research-agent",
    provider: "google",
    model: "gemini-3-pro",
    status: "completed",
    durationMs: 13_044,
    costUsd: 0.0157,
    attempts: 2,
    maxAttempts: 3,
    tools: ["web.search", "scrape"],
    startedAt: ago(128),
  },
  {
    id: "exec_01J9XHGQWE0R2T4Y6U8I0O2P4A6S8D",
    traceId: "trace_2e4f6a8c0e2a4c6e8a0c2e4f6a8c0e2f",
    agent: "code-reviewer",
    provider: "anthropic",
    model: "claude-sonnet-4.6",
    status: "completed",
    durationMs: 17_295,
    costUsd: 0.0239,
    attempts: 1,
    maxAttempts: 3,
    tools: ["git.diff", "test.run"],
    startedAt: ago(149),
  },
  {
    id: "exec_01J9XHCMNB1V3C5X7Z9A1S3D5F7G9H",
    traceId: "trace_8a0c2e4a6c8e0a2c4e6f8a0c2e4f6a8c",
    agent: "data-pipeline",
    provider: "azure-openai",
    model: "gpt-5.2",
    status: "running",
    durationMs: 1_850,
    costUsd: 0.0012,
    attempts: 1,
    maxAttempts: 3,
    tools: ["sql.query"],
    startedAt: ago(0.4),
  },
  {
    id: "exec_01J9XH8POI2U4Y6T8R0E2W4Q6A8S0D",
    traceId: "trace_5c7e9a1c3e5a7c9e1a3c5e7a9c1e3f5a",
    agent: "support-copilot",
    provider: "openai",
    model: "gpt-5-mini",
    status: "completed",
    durationMs: 3_522,
    costUsd: 0.0021,
    attempts: 1,
    maxAttempts: 3,
    tools: ["kb.lookup"],
    startedAt: ago(163),
  },
  {
    id: "exec_01J9XH4LKJ3H5G7F9D1S3A5Q7W9E1R",
    traceId: "trace_1e3f5a7c9e1a3c5e7a9c1e3f5a7c9e1a",
    agent: "docs-assistant",
    provider: "google",
    model: "gemini-3-flash",
    status: "completed",
    durationMs: 1_988,
    costUsd: 0.0008,
    attempts: 1,
    maxAttempts: 3,
    tools: ["vector.query"],
    startedAt: ago(181),
  },
  {
    id: "exec_01J9XH0TGF4R6E8W0Q2A4S6D8F0G2H",
    traceId: "trace_4f6a8c0e2a4c6e8a0c2e4f6a8c0e2f4a",
    agent: "research-agent",
    provider: "openai",
    model: "gpt-5.2",
    status: "failed",
    durationMs: 44_120,
    costUsd: 0.0312,
    attempts: 3,
    maxAttempts: 3,
    tools: ["web.search", "scrape", "pdf.extract"],
    startedAt: ago(205),
    failureType: "timeout",
    failureMessage: "Tool scrape exceeded execution deadline of 30000ms (attempt 3 of 3)",
  },
  {
    id: "exec_01J9XGWDCE5R7T9Y1U3I5O7P9A1S3D",
    traceId: "trace_7a9c1e3a5c7e9a1c3e5f7a9c1e3f5a7c",
    agent: "code-reviewer",
    provider: "openai",
    model: "gpt-5.2",
    status: "completed",
    durationMs: 21_407,
    costUsd: 0.0285,
    attempts: 2,
    maxAttempts: 3,
    tools: ["git.diff", "code.exec", "test.run"],
    startedAt: ago(232),
  },
  {
    id: "exec_01J9XGSXAQ6W8E0R2T4Y6U8I0O2P4A",
    traceId: "trace_0c2e4a6c8e0a2c4e6f8a0c2e4f6a8c0e",
    agent: "support-copilot",
    provider: "anthropic",
    model: "claude-sonnet-4.6",
    status: "completed",
    durationMs: 6_134,
    costUsd: 0.0089,
    attempts: 1,
    maxAttempts: 3,
    tools: ["vector.query", "kb.lookup", "email.send"],
    startedAt: ago(258),
  },
  {
    id: "exec_01J9XGOLDP7A9S1D3F5G7H9J1K3L5M",
    traceId: "trace_3a5c7e9a1c3e5a7c9e1a3c5e7a9c1e3f",
    agent: "data-pipeline",
    provider: "azure-openai",
    model: "gpt-5-mini",
    status: "cancelled",
    durationMs: 640,
    costUsd: 0.0001,
    attempts: 1,
    maxAttempts: 3,
    tools: [],
    startedAt: ago(289),
  },
  {
    id: "exec_01J9XGKQAZ8S0D2F4G6H8J0K2L4M6N",
    traceId: "trace_6e8a0c2e4a6c8e0a2c4e6f8a0c2e4f6a",
    agent: "research-agent",
    provider: "anthropic",
    model: "claude-opus-4.6",
    status: "completed",
    durationMs: 28_960,
    costUsd: 0.0742,
    attempts: 1,
    maxAttempts: 3,
    tools: ["web.search", "scrape", "vector.query"],
    startedAt: ago(318),
  },
  {
    id: "exec_01J9XGGXSW9E1R3T5Y7U9I1O3P5A7S",
    traceId: "trace_9c1e3a5c7e9a1c3e5a7c9e1a3c5e7a9c",
    agent: "docs-assistant",
    provider: "openai",
    model: "gpt-5-mini",
    status: "completed",
    durationMs: 4_466,
    costUsd: 0.0033,
    attempts: 1,
    maxAttempts: 3,
    tools: ["vector.query", "file.read"],
    startedAt: ago(351),
  },
  {
    id: "exec_01J9XGCVFR0T2Y4U6I8O0P2A4S6D8F",
    traceId: "trace_2f4a6c8e0a2c4e6f8a0c2e4f6a8c0e2a",
    agent: "code-reviewer",
    provider: "google",
    model: "gemini-3-pro",
    status: "completed",
    durationMs: 15_721,
    costUsd: 0.0176,
    attempts: 1,
    maxAttempts: 3,
    tools: ["git.diff", "test.run"],
    startedAt: ago(388),
  },
  {
    id: "exec_01J9XG8NHY1U3I5O7P9A1S3D5F7G9H",
    traceId: "trace_5a7c9e1a3c5e7a9c1e3f5a7c9e1a3c5e",
    agent: "support-copilot",
    provider: "openai",
    model: "gpt-5.2",
    status: "completed",
    durationMs: 5_088,
    costUsd: 0.0074,
    attempts: 1,
    maxAttempts: 3,
    tools: ["vector.query", "kb.lookup"],
    startedAt: ago(424),
  },
];

// ---- Dead-letter queue -------------------------------------------------

export interface DeadLetter {
  executionId: string;
  traceId: string;
  agent: string;
  provider: string;
  failureType: FailureType;
  failureMessage: string;
  attempts: number;
  firstFailedAt: string;
  finalFailedAt: string;
  deadLetteredAt: string;
}

export const deadLetters: DeadLetter[] = [
  {
    executionId: "exec_01J9XH0TGF4R6E8W0Q2A4S6D8F0G2H",
    traceId: "trace_4f6a8c0e2a4c6e8a0c2e4f6a8c0e2f4a",
    agent: "research-agent",
    provider: "openai",
    failureType: "timeout",
    failureMessage: "Tool scrape exceeded execution deadline of 30000ms (attempt 3 of 3)",
    attempts: 3,
    firstFailedAt: ago(207),
    finalFailedAt: ago(205),
    deadLetteredAt: ago(204),
  },
  {
    executionId: "exec_01J9XJMNOP8Q0R2S4T6U8V0W2X4Y6Z",
    traceId: "trace_8c0e2a4c6e8a0c2e4f6a8b0d2f4a6c8e",
    agent: "data-pipeline",
    provider: "azure-openai",
    failureType: "tool_error",
    failureMessage: "sql.query: connection refused — postgres://db.internal:5432",
    attempts: 3,
    firstFailedAt: ago(38),
    finalFailedAt: ago(33),
    deadLetteredAt: ago(32),
  },
  {
    executionId: "exec_01J9XF2CVB4N6M8Q0W2E4R6T8Y0U2I4O",
    traceId: "trace_1b3d5f7a9c1e3a5c7e9a1c3e5a7c9e1a",
    agent: "research-agent",
    provider: "openai",
    failureType: "rate_limited",
    failureMessage: "HTTP 429 — provider rate limit exceeded after 3 attempts",
    attempts: 3,
    firstFailedAt: ago(492),
    finalFailedAt: ago(486),
    deadLetteredAt: ago(485),
  },
  {
    executionId: "exec_01J9XE8WQZ2X4C6V8B0N2M4Q6W8E0R2T",
    traceId: "trace_8d0f2a4c6e8a0c2e4f6a8b0d2f4a6c8e",
    agent: "support-copilot",
    provider: "google",
    failureType: "budget_exceeded",
    failureMessage: "Execution cost $0.0211 exceeded remaining budget of $0.0150",
    attempts: 2,
    firstFailedAt: ago(721),
    finalFailedAt: ago(718),
    deadLetteredAt: ago(717),
  },
  {
    executionId: "exec_01J9XE4EDC3V5B7N9M1Q3W5E7R9T1Y3U",
    traceId: "trace_5f7a9c1e3a5c7e9a1c3e5f7a9c1e3f5a",
    agent: "code-reviewer",
    provider: "anthropic",
    failureType: "model_error",
    failureMessage: "Provider returned 529 Overloaded after 3 attempts",
    attempts: 3,
    firstFailedAt: ago(1_243),
    finalFailedAt: ago(1_236),
    deadLetteredAt: ago(1_235),
  },
  {
    executionId: "exec_01J9XE0RFC4T6Y8U0I2O4P6A8S0D2F4G",
    traceId: "trace_2c4e6a8c0e2a4c6e8a0c2e4f6a8c0e2f",
    agent: "data-pipeline",
    provider: "azure-openai",
    failureType: "timeout",
    failureMessage: "Execution exceeded max duration of 120000ms",
    attempts: 3,
    firstFailedAt: ago(1_870),
    finalFailedAt: ago(1_862),
    deadLetteredAt: ago(1_861),
  },
];

// ---- Time series (24 hourly buckets) ------------------------------------

export interface MetricPoint {
  time: string;
  succeeded: number;
  failed: number;
  p50: number;
  p95: number;
  cost: number;
  throughput: number;
  queueDepth: number;
  providerErrors: number;
  retries: number;
  toolInvocations: number;
}

// deterministic pseudo-random walk
function wave(i: number, seed: number, amp: number, base: number) {
  return (
    base +
    Math.sin(i / 2.7 + seed) * amp * 0.6 +
    Math.sin(i / 1.3 + seed * 2.1) * amp * 0.4
  );
}

export const metricSeries: MetricPoint[] = Array.from({ length: 24 }, (_, i) => {
  const hour = (16 + i) % 24;
  const succeeded = Math.max(2, Math.round(wave(i, 1.7, 34, 62)));
  const failed = Math.max(0, Math.round(wave(i, 4.2, 7, 6)));
  const p50 = Math.round(wave(i, 2.3, 420, 2_150));
  const p95 = Math.round(p50 + wave(i, 5.1, 1_900, 5_400));
  const throughput = succeeded + failed;
  return {
    time: `${String(hour).padStart(2, "0")}:00`,
    succeeded,
    failed,
    p50,
    p95,
    cost: +(throughput * 0.0068 + wave(i, 3.3, 0.12, 0.18)).toFixed(2),
    throughput,
    queueDepth: Math.max(0, Math.round(wave(i, 6.8, 14, 9))),
    providerErrors: Math.max(0, Math.round(wave(i, 8.4, 5, 3))),
    retries: Math.max(0, Math.round(wave(i, 9.6, 6, 5))),
    toolInvocations: Math.round(throughput * wave(i, 11.2, 0.8, 2.6)),
  };
});

// ---- System health --------------------------------------------------------

export type HealthState = "operational" | "degraded" | "down";

export interface HealthService {
  name: string;
  state: HealthState;
  latencyMs?: number;
  detail: string;
}

export const healthServices: HealthService[] = [
  { name: "API", state: "operational", latencyMs: 12, detail: "12ms · 99.99% uptime" },
  { name: "Worker", state: "operational", latencyMs: 4, detail: "4 replicas · 0 restarts" },
  { name: "PostgreSQL", state: "operational", latencyMs: 3, detail: "3ms · 14 connections" },
  { name: "Queue", state: "operational", detail: "depth 7 · 0 poison messages" },
  { name: "Storage", state: "degraded", detail: "Azurite latency elevated (212ms)" },
  { name: "Observability", state: "operational", latencyMs: 8, detail: "OTel collector · 100% spans" },
];

// ---- Flight Recorder timeline ----------------------------------------------

export type TimelineEventType =
  | "created"
  | "queued"
  | "started"
  | "model_request"
  | "tool_call"
  | "retry_scheduled"
  | "budget_warning"
  | "completed"
  | "failed"
  | "cancelled";

export type EventStatus = "success" | "failure" | "info" | "warning" | "running";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  label: string;
  offsetMs: number; // ms after execution start
  durationMs?: number;
  status: EventStatus;
  attempt: number;
  meta?: string;
  details?: Record<string, unknown>;
}

const T0 = new Date(ago(6)).getTime();

export const featuredTimeline: TimelineEvent[] = [
  {
    id: "evt_01",
    type: "created",
    label: "Created",
    offsetMs: 0,
    status: "info",
    attempt: 1,
    meta: "via api · POST /v1/executions",
    details: {
      agent: "research-agent",
      provider: "openai",
      model: "gpt-5.2",
      input: "Summarize the Q3 reliability postmortems for acme-corp",
      budget: { maxCostUsd: 0.05, maxAttempts: 3, maxDurationMs: 120000, maxToolCalls: 12 },
      idempotencyKey: "idem_9f2k41xz",
    },
  },
  {
    id: "evt_02",
    type: "queued",
    label: "Queued",
    offsetMs: 42,
    durationMs: 812,
    status: "info",
    attempt: 1,
    meta: "queue: default · position 1",
    details: { queue: "default", position: 1, waitMs: 812, shard: "queue-03" },
  },
  {
    id: "evt_03",
    type: "started",
    label: "Started",
    offsetMs: 854,
    status: "running",
    attempt: 1,
    meta: "worker: worker-7b9f · attempt 1 of 3",
    details: { worker: "worker-7b9f", attempt: 1, maxAttempts: 3, pid: 4281 },
  },
  {
    id: "evt_04",
    type: "model_request",
    label: "Model Request",
    offsetMs: 1_010,
    durationMs: 2_340,
    status: "success",
    attempt: 1,
    meta: "gpt-5.2 · 2,184 in / 312 out · $0.0041",
    details: {
      provider: "openai",
      model: "gpt-5.2",
      tokensIn: 2184,
      tokensOut: 312,
      costUsd: 0.0041,
      latencyMs: 2340,
      toolCallsPlanned: ["web.search", "scrape"],
    },
  },
  {
    id: "evt_05",
    type: "tool_call",
    label: "Tool: web.search",
    offsetMs: 3_402,
    durationMs: 632,
    status: "success",
    attempt: 1,
    meta: "success — 632ms · 8 results",
    details: {
      tool: "web.search",
      arguments: { query: "acme-corp Q3 reliability postmortem", maxResults: 8 },
      results: 8,
      latencyMs: 632,
      costUsd: 0.0005,
    },
  },
  {
    id: "evt_06",
    type: "tool_call",
    label: "Tool: scrape",
    offsetMs: 4_090,
    durationMs: 1_204,
    status: "failure",
    attempt: 1,
    meta: "failed — HTTP 429",
    details: {
      tool: "scrape",
      arguments: { url: "https://status.acme-corp.com/postmortems/q3" },
      error: "HTTP 429 Too Many Requests",
      retryAfter: "2s",
      latencyMs: 1204,
      responseHeaders: { "retry-after": "2", "x-ratelimit-remaining": "0" },
    },
  },
  {
    id: "evt_07",
    type: "retry_scheduled",
    label: "Retry Scheduled",
    offsetMs: 5_312,
    status: "warning",
    attempt: 1,
    meta: "2 second backoff · attempt 2 of 3",
    details: {
      reason: "rate_limited",
      backoffMs: 2000,
      strategy: "exponential",
      nextAttempt: 2,
      maxAttempts: 3,
    },
  },
  {
    id: "evt_08",
    type: "started",
    label: "Started — Attempt 2",
    offsetMs: 7_330,
    status: "running",
    attempt: 2,
    meta: "worker: worker-7b9f · resuming checkpoint evt_05",
    details: { worker: "worker-7b9f", attempt: 2, resumedFrom: "evt_05", checkpointRestored: true },
  },
  {
    id: "evt_09",
    type: "tool_call",
    label: "Tool: scrape",
    offsetMs: 7_390,
    durationMs: 1_812,
    status: "success",
    attempt: 2,
    meta: "success — 1,812ms · 42.1 KB",
    details: {
      tool: "scrape",
      arguments: { url: "https://status.acme-corp.com/postmortems/q3" },
      statusCode: 200,
      bytes: 43_110,
      latencyMs: 1812,
      costUsd: 0.0005,
    },
  },
  {
    id: "evt_10",
    type: "model_request",
    label: "Model Request",
    offsetMs: 9_260,
    durationMs: 5_120,
    status: "success",
    attempt: 2,
    meta: "gpt-5.2 · 6,412 in / 1,208 out · $0.0091",
    details: {
      provider: "openai",
      model: "gpt-5.2",
      tokensIn: 6412,
      tokensOut: 1208,
      costUsd: 0.0091,
      latencyMs: 5120,
    },
  },
  {
    id: "evt_11",
    type: "completed",
    label: "Completed",
    offsetMs: 14_820,
    status: "success",
    attempt: 2,
    meta: "total 14.82s · $0.0142 · 2 attempts",
    details: {
      outcome: "success",
      totalDurationMs: 14820,
      totalCostUsd: 0.0142,
      attempts: 2,
      artifactIds: ["art_summary_md", "art_sources_json"],
    },
  },
];

// Generic timeline builder for non-featured executions
export function buildTimeline(exec: Execution): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let t = 0;
  const push = (e: Omit<TimelineEvent, "id" | "offsetMs">) => {
    events.push({ ...e, id: `evt_${events.length + 1}`, offsetMs: t });
    t += e.durationMs ?? 120;
  };

  push({
    type: "created",
    label: "Created",
    status: "info",
    attempt: 1,
    meta: "via api · POST /v1/executions",
    details: { agent: exec.agent, provider: exec.provider, model: exec.model },
  });
  push({
    type: "queued",
    label: "Queued",
    status: "info",
    attempt: 1,
    durationMs: 640,
    meta: "queue: default · position 2",
    details: { queue: "default", position: 2, waitMs: 640 },
  });

  for (let attempt = 1; attempt <= Math.max(exec.attempts, 1); attempt++) {
    const last = attempt === Math.max(exec.attempts, 1);
    push({
      type: "started",
      label: attempt > 1 ? `Started — Attempt ${attempt}` : "Started",
      status: "running",
      attempt,
      meta: `worker: worker-7b9f · attempt ${attempt} of ${exec.maxAttempts}`,
      details: { worker: "worker-7b9f", attempt, maxAttempts: exec.maxAttempts },
    });
    push({
      type: "model_request",
      label: "Model Request",
      status: "success",
      attempt,
      durationMs: Math.round(exec.durationMs * 0.35) || 1800,
      meta: `${exec.model} · $${(exec.costUsd * 0.6).toFixed(4)}`,
      details: {
        provider: exec.provider,
        model: exec.model,
        costUsd: +(exec.costUsd * 0.6).toFixed(4),
      },
    });
    exec.tools.forEach((tool, i) => {
      const toolFails = exec.status !== "completed" && last && i === exec.tools.length - 1;
      push({
        type: "tool_call",
        label: `Tool: ${tool}`,
        status: toolFails ? "failure" : "success",
        attempt,
        durationMs: 400 + i * 260,
        meta: toolFails
          ? `failed — ${exec.failureMessage ?? "tool error"}`
          : `success — ${400 + i * 260}ms`,
        details: toolFails
          ? { tool, error: exec.failureMessage ?? "tool error" }
          : { tool, latencyMs: 400 + i * 260 },
      });
    });
    if (!last) {
      push({
        type: "retry_scheduled",
        label: "Retry Scheduled",
        status: "warning",
        attempt,
        meta: `${attempt * 2} second backoff · attempt ${attempt + 1} of ${exec.maxAttempts}`,
        details: { reason: exec.failureType ?? "transient", backoffMs: attempt * 2000 },
      });
      t += attempt * 2000;
    }
  }

  if (exec.status === "completed") {
    push({
      type: "completed",
      label: "Completed",
      status: "success",
      attempt: exec.attempts || 1,
      meta: `total ${(exec.durationMs / 1000).toFixed(2)}s · $${exec.costUsd.toFixed(4)}`,
      details: { outcome: "success", totalDurationMs: exec.durationMs, totalCostUsd: exec.costUsd },
    });
  } else if (exec.status === "failed" || exec.status === "dead_lettered") {
    push({
      type: "failed",
      label: "Failed",
      status: "failure",
      attempt: exec.attempts || 1,
      meta: exec.failureMessage ?? "execution failed",
      details: { failureType: exec.failureType, message: exec.failureMessage },
    });
  } else if (exec.status === "cancelled") {
    push({
      type: "cancelled",
      label: "Cancelled",
      status: "warning",
      attempt: 1,
      meta: "cancelled by operator",
      details: { cancelledBy: "p.yousefi", reason: "superseded by newer execution" },
    });
  } else {
    push({
      type: "started",
      label: "Running",
      status: "running",
      attempt: 1,
      meta: "in progress…",
      details: { state: exec.status },
    });
  }
  return events;
}

// ---- Detail tabs data --------------------------------------------------------

export interface LogLine {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
}

export function buildLogs(exec: Execution, events: TimelineEvent[]): LogLine[] {
  const start = new Date(exec.startedAt).getTime();
  return events.map((e) => ({
    ts: new Date(start + e.offsetMs).toISOString(),
    level:
      e.status === "failure"
        ? "error"
        : e.status === "warning"
          ? "warn"
          : e.status === "running"
            ? "debug"
            : "info",
    source:
      e.type === "tool_call" ? "tools" : e.type === "model_request" ? "provider" : "orchestrator",
    message: `${e.label}${e.meta ? ` — ${e.meta}` : ""}`,
  }));
}

export interface CostRow {
  item: string;
  detail: string;
  costUsd: number;
}

export function buildCost(exec: Execution): { rows: CostRow[]; budgetUsd: number } {
  const model = +(exec.costUsd * 0.88).toFixed(4);
  const tools = +(exec.costUsd * 0.11).toFixed(4);
  const infra = +(exec.costUsd - model - tools).toFixed(4);
  return {
    rows: [
      { item: "Model tokens", detail: `${exec.model} · input + output`, costUsd: model },
      { item: "Tool calls", detail: `${exec.tools.length} tool types · ${exec.attempts} attempt(s)`, costUsd: tools },
      { item: "Execution infrastructure", detail: "worker time + queue + storage", costUsd: infra },
    ],
    budgetUsd: 0.05,
  };
}

export interface Artifact {
  id: string;
  name: string;
  kind: string;
  size: string;
  createdAtOffsetMs: number;
}

export function buildArtifacts(exec: Execution): Artifact[] {
  if (exec.status !== "completed") return [];
  return [
    {
      id: "art_summary_md",
      name: "summary.md",
      kind: "text/markdown",
      size: "4.2 KB",
      createdAtOffsetMs: exec.durationMs - 400,
    },
    {
      id: "art_sources_json",
      name: "sources.json",
      kind: "application/json",
      size: "1.8 KB",
      createdAtOffsetMs: exec.durationMs - 380,
    },
    {
      id: "art_prompt_trace",
      name: "prompt-trace.txt",
      kind: "text/plain",
      size: "12.6 KB",
      createdAtOffsetMs: exec.durationMs - 120,
    },
  ];
}

export interface TraceSpan {
  id: string;
  name: string;
  service: string;
  startMs: number;
  durationMs: number;
  status: "ok" | "error";
  children?: TraceSpan[];
}

export function buildTrace(exec: Execution, events: TimelineEvent[]): TraceSpan {
  const spans: TraceSpan[] = events
    .filter((e) => e.durationMs)
    .map((e) => ({
      id: `span_${e.id}`,
      name: e.label,
      service:
        e.type === "tool_call" ? "tools" : e.type === "model_request" ? "provider" : "orchestrator",
      startMs: e.offsetMs,
      durationMs: e.durationMs!,
      status: e.status === "failure" ? "error" : "ok",
    }));
  return {
    id: `span_root`,
    name: `execution ${exec.id}`,
    service: "orchestrator",
    startMs: 0,
    durationMs: exec.durationMs || 1000,
    status: exec.status === "failed" ? "error" : "ok",
    children: spans,
  };
}

export function buildRawJson(exec: Execution, events: TimelineEvent[]) {
  return {
    id: exec.id,
    traceId: exec.traceId,
    agent: exec.agent,
    provider: exec.provider,
    model: exec.model,
    status: exec.status,
    attempts: exec.attempts,
    maxAttempts: exec.maxAttempts,
    durationMs: exec.durationMs,
    costUsd: exec.costUsd,
    startedAt: exec.startedAt,
    failureType: exec.failureType ?? null,
    replayOf: exec.replayOf ?? null,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      label: e.label,
      offsetMs: e.offsetMs,
      durationMs: e.durationMs ?? null,
      status: e.status,
      attempt: e.attempt,
      details: e.details ?? null,
    })),
  };
}

// ---- Demo scenarios -----------------------------------------------------------

export interface DemoScenario {
  id: string;
  name: string;
  icon: string;
  description: string;
  expected: string;
  targetExecutionId: string;
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "success",
    name: "Successful Execution",
    icon: "check-circle",
    description: "Normal execution path — model call, tools succeed, execution completes.",
    expected: "Completes in a single attempt with all tool calls green.",
    targetExecutionId: FEATURED_EXECUTION_ID,
  },
  {
    id: "transient-failure",
    name: "Transient Failure",
    icon: "refresh-cw",
    description: "First attempt fails and automatically retries successfully.",
    expected: "Attempt 1 fails, backoff is scheduled, attempt 2 completes.",
    targetExecutionId: FEATURED_EXECUTION_ID,
  },
  {
    id: "rate-limited",
    name: "Rate Limited",
    icon: "gauge",
    description: "Provider returns HTTP 429 and the orchestrator backs off.",
    expected: "429 recorded, retry-after honored, execution recovers or exhausts attempts.",
    targetExecutionId: "exec_01J9XKG2TQ4W6Y8A0C2E4G6I8K0M2O",
  },
  {
    id: "timeout",
    name: "Timeout",
    icon: "timer-off",
    description: "A tool call exceeds the configured execution deadline.",
    expected: "Deadline enforced at 30s, span marked error, failure recorded.",
    targetExecutionId: "exec_01J9XK90ZA1B3C5D7E9F1G3H5J7L9N",
  },
  {
    id: "budget-exceeded",
    name: "Budget Exceeded",
    icon: "wallet",
    description: "Execution crosses its configured cost budget mid-run.",
    expected: "Budget guard halts the run before more spend accrues.",
    targetExecutionId: "exec_01J9XJ6ZXC4V6B8N0M2Q4W6E8R0T2Y",
  },
  {
    id: "dead-letter",
    name: "Dead Letter",
    icon: "skull",
    description: "All retry attempts fail and the execution is dead-lettered.",
    expected: "Execution becomes an immutable record in the dead-letter queue.",
    targetExecutionId: "exec_01J9XH0TGF4R6E8W0Q2A4S6D8F0G2H",
  },
  {
    id: "replay",
    name: "Replay Execution",
    icon: "play",
    description: "Replay a historical execution from its recorded envelope.",
    expected: "A new execution is created, linked to the original via replayOf.",
    targetExecutionId: "exec_01J9XJGHJK1L3M5N7P9Q1R3S5T7U9V",
  },
];

// ---- Formatting helpers -------------------------------------------------------

export function fmtDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtCost(usd: number): string {
  if (usd === 0) return "—";
  return `$${usd.toFixed(4)}`;
}

export function fmtRelative(iso: string): string {
  const diff = BASE - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

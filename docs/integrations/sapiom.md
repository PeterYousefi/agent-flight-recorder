# Sapiom integration

Verified on 2026-10-07 against the [official Router reference](https://docs.sapiom.ai/router/). The adapter uses `POST https://router.sapiom.ai/v1/chat/completions` with `Authorization: Bearer` supplied exclusively from `SAPIOM_API_KEY`. It sends non-streaming chat requests with `model`, `messages` and `max_tokens`, then validates the first returned message. Studio credentials are never read.

Default: `SAPIOM_ENABLED=false`. The application runs entirely with MockProvider when disabled. Explicit Sapiom requests must fail if the adapter is unavailable; they must not silently turn into mock executions. Environment keys are kept in private fields, excluded from responses, logs, traces and events.

AFR operation: `chat.completions`. Input uses `model`, `messages` and optional `maxTokens` (1–4096). The provider normalizes successful text, rate limits, HTTP errors, network failures and local deadlines. Server error bodies are discarded. There is no undocumented health or cancellation request. Health reports configuration without claiming a live probe succeeded.

The Router contract does not document per-call dollar charges. The adapter returns no cost estimate or measurement and never treats token usage as spend. Preflight dollar budgeting cannot bound an unknown-priced external call; configure provider-specific governance before depending on live financial limits. Retrying can repeat external work: the verified Router contract does not promise execution-key deduplication. Local HTTP aborts do not guarantee remote cancellation.

## Tests

Normal tests use injected mocked HTTP and exclude the live test configuration, so they make no real Sapiom requests even if the opt-in flag is set. One live test exists and is skipped unless `RUN_SAPIOM_INTEGRATION_TESTS=true`; it additionally requires `SAPIOM_ENABLED=true`, `SAPIOM_API_KEY` and `SAPIOM_MODEL`. The bounded live call may incur Sapiom charges. It has not been run for this local release work.

```sh
pnpm --filter @afr/providers test
# Opt-in live testing: set the four environment variables above, then run
pnpm --filter @afr/providers test:live
```

## Integration scope

The first adapter is deliberately limited to the verified Router contract. [Sapiom capabilities](https://docs.sapiom.ai/capabilities/) have their own versioned SDK declarations; future capability adapters must typecheck against those declarations. AFR owns its local execution history, retries, replay, budgets and observability. It does not claim that these capabilities are absent from Sapiom's broader platform.

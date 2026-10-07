# Bounded retries

Execution retries are database facts, separate from transport redelivery. A failed attempt records a safe error and tool failure, then either schedules a retry or transitions to FAILED. The default policy allows three attempts, one-second initial backoff, exponential growth, and a 30-second exponential cap. Equal jitter uses half to all of the capped delay. Randomness and time are injected for tests.

The effective attempt limit is the smaller of the retry policy and execution budget. Permanent errors never retry. Rate-limit hints are honored when finite and within one day; invalid or larger hints stop retry rather than scheduling unbounded work or retrying earlier than requested.

Each retry commits its event, RETRY_SCHEDULED snapshot and due outbox message atomically. The dispatcher transitions to QUEUED only when the due message's attempt number matches the next attempt. Stale initial or duplicate messages cannot queue the next attempt early. Cancellation suppresses due retry messages. There is no worker sleep or tight retry loop.

Provider estimation and execution have bounded deadlines, capped below the worker lease duration. Deadline expiry is classified as retryable. Injected timing tests avoid wall-clock sleeps. An external call may continue after a local deadline; retries do not guarantee exactly-once external side effects. Providers must honor execution-scoped idempotency to provide that protection.

Expired worker claims finish the old attempt as failed and use the same retry scheduler. Late worker completion is fenced by attempt ID and finished status. Costs and attempt history remain inspectable across retries. Terminal dead-letter handling is a separate reliability service.

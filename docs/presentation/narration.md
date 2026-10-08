# Three-minute narration

Five slides, including the title. Aim for a relaxed pace of roughly 125–135 words per minute. The time slots include short pauses and slide changes; rehearse once and shorten pauses if you run over three minutes. Read only the quoted paragraphs, not the headings or image instructions.

## Slide 1 — Agent Flight Recorder

**Time: 0:00–0:25 · Picture: `images/slide-01-overview.png`**

> My project is Agent Flight Recorder. It records what happens when an agent execution runs, fails, retries, or reaches a budget limit. The goal is to make that work easier to investigate. This is a working local demo: the interface reads real stored execution data, while the provider responses and displayed costs are simulated.

## Slide 2 — How an execution works

**Time: 0:25–1:00 · Picture: editable diagram created by Gamma; no PNG needed**

> An execution starts in the console and goes through the API. PostgreSQL stores its state, its history, and a durable outbox: a record of messages that still need to be sent. A dispatcher sends those messages to a queue, and a worker picks them up to run the provider. Separating these steps lets the API respond without waiting for the whole job. Results and private artifacts are saved, and tracing connects the services.

## Slide 3 — Recovery after a failure

**Time: 1:00–1:45 · Picture: `images/slide-03-execution-graph.png`**

> Here is the transient failure scenario. The first provider call fails, shown in red. The system records that failure and schedules a retry, shown in amber. The second attempt succeeds, shown in green, and its output is saved as a private artifact. The graph comes from the actual recorded events, so it explains how the result was reached. The demo also covers timeouts, rate limits, permanent failures, cancellation, and exhausted retries. Failed work remains available for inspection instead of disappearing behind a single error message.

## Slide 4 — A history you can investigate

**Time: 1:45–2:30 · Picture: `images/slide-04-flight-recorder.png`**

> The flight recorder presents the same execution as an ordered timeline. I can inspect individual attempts, compare estimated and recorded costs, open the saved artifacts, and use trace identifiers to follow work across services. The demo's dollar amounts are synthetic, so they show how the application's budget rules behave without paying an external provider. Replay creates a new, linked execution rather than editing the original. That preserves the evidence of what happened and lets me compare the new outcome with the source. Terminal failures can also be inspected and requeued into a new execution.

## Slide 5 — Try the demo

**Time: 2:30–3:00 · Picture: `images/slide-05-demo-lab.png`**

> The repository includes setup instructions and automated tests. Demo Lab provides repeatable scenarios without a paid AI key. A useful starting point is transient failure: inspect the retry, open the timeline, and then try a simulation replay. Public Azure hosting is planned; the repository and local demo are available now. My focus was reliable execution and useful evidence when something fails.

## Recording

Paste each paragraph into its slide's speaker notes. Read the first sentence, pause briefly, then explain the image. On slide 3, point to red → amber → green. On slide 4, point to the recorded retry and the replay controls. On slide 5, pause at the repository link.

Use Gamma's presenter view for private notes and its presentation timer. For a narrated video, record the presentation with your microphone using a screen recorder, keeping the notes outside the captured presentation window. Notes alone do not create a voiceover. Do not record terminal windows, account details or credentials.

[Gamma speaker notes](https://help.gamma.app/en/articles/11047307-can-i-use-speaker-notes-while-presenting-in-gamma).

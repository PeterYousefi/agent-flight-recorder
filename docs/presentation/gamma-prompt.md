# Gamma prompt

Copy the text below into Gamma's creation prompt. Attach the four PNGs in `images/`, or select image placeholders and insert the PNGs after generation. Keep the narration in `narration.md` separate from the slide text.

```text
Create exactly FIVE slides, including the title slide, for a THREE-MINUTE spoken presentation about my software engineering project, Agent Flight Recorder. Audience: recruiters, classmates and software engineers. Use clear, confident English and explain unfamiliar terms briefly. Do not add slides or extra claims.

DESIGN
Use a 16:9 presentation format, a dark charcoal background, white text, and restrained violet accents matching the supplied application screenshots. Use large readable titles and short body text. Use one clear composition per slide, with generous space. No stock photos, robots, invented dashboards or AI-generated screenshots. Keep screenshot proportions intact. Use the actual attached images by their filenames. The screenshots are historical captures of a working local demo; do not turn their numbers into performance benchmarks or cloud bills. Add the small caption “Local mock demo · costs are synthetic” on slides with cost figures.

SLIDE 1 — Agent Flight Recorder
Subtitle: Record, inspect and replay agent executions
Short supporting line: A working local demo for investigating failures, retries and costs
Image: slide-01-overview.png. Show only the upper overview and metric cards; crop away the empty/loading chart and table below. Treat the metric numbers as sample demo output, not headline achievements. Keep the project title dominant.

SLIDE 2 — How an execution works
Create a simple EDITABLE flow diagram using this exact main sequence:
Console → API → Durable outbox → Queue → Worker → Provider
Show PostgreSQL connected to the API/outbox and worker, labelled “Execution state + ordered history”. Show “Private artifacts” connected to the worker. Show a small supporting branch labelled “OpenTelemetry → traces + metrics”. Keep this readable, with a maximum of three short explanation lines:
- Queue separates requests from execution
- PostgreSQL preserves state and history
- Traces connect work across services
Small footer: “Local demo: Service Bus emulator + Azurite; default provider: MockProvider”. No screenshot is needed on this slide. Do not label the system as deployed on Azure.

SLIDE 3 — Recovery after a failure
Image: slide-03-execution-graph.png. Make the execution graph the dominant visual. Crop to the Graph panel, preserving both attempts and the red, amber and green nodes. Exclude the raw JSON panel below.
Three short labels:
- Attempt 1 fails
- Retry is scheduled
- Attempt 2 succeeds
Small caption: “Actual recorded events from a simulated provider failure”. Do not claim the graph proves every external side effect happens exactly once.

SLIDE 4 — A history you can investigate
Image: slide-04-flight-recorder.png. Use a large view of the ordered timeline, especially the failed call, retry and successful second attempt. Crop away the raw JSON below. Keep the replay controls visible if space allows, without making the event text unreadably small.
Three short supporting lines:
- Inspect events, attempts and private artifacts
- Compare estimated and recorded costs
- Replay creates a linked execution and preserves the original
Small caption: “Local mock demo · costs are synthetic”. These are application execution budgets, not guaranteed limits on Azure billing.

SLIDE 5 — Try the demo
Image: slide-05-demo-lab.png. Show only the top of this mobile screenshot: Demo Lab, Successful Execution and Transient Failure. Do not shrink the entire long image into the slide. Position it beside the text.
Text:
- Reproduce retries, timeouts and budget failures
- Inspect the recorded history and try a replay
- Repository: github.com/PeterYousefi/agent-flight-recorder
Closing line: “My focus: reliable execution and useful evidence when work fails.”
Small status line: “Available now: repository and local demo · public Azure hosting planned”. Do not invent a live website, customer adoption, paid model usage, security certification, production readiness, benchmark or a guaranteed hosting cost.

Keep visible slide text concise. I will add the separate per-slide narration as speaker notes and record the voiceover myself. Do not place narration paragraphs on the slides.
```

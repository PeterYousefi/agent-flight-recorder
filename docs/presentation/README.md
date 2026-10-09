# Agent Flight Recorder — three-minute Gamma presentation

This pack contains a ready-to-paste Gamma prompt, a narration script for each slide, and four genuine application screenshots. A live Azure demo is available alongside the downloadable repository. No local services or Docker builds are needed to use these files.

## Files to use

- [Gamma prompt](gamma-prompt.md): copy the fenced text into Gamma.
- [Narration](narration.md): five spoken sections with time slots totalling three minutes.
- [All files as a ZIP](gamma-presentation-pack.zip): download and extract, then upload the PNGs to Gamma.

## Pictures for each page

| Slide                            | Time      | Picture                                                | What to show                                                                                                       |
| -------------------------------- | --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1. Agent Flight Recorder         | 0:00–0:25 | [Overview](images/slide-01-overview.png)               | Top overview and metric cards. Crop away the lower loading/empty areas. Numbers are sample output, not benchmarks. |
| 2. How an execution works        | 0:25–1:00 | No screenshot                                          | Ask Gamma to create the editable flow diagram specified in the prompt.                                             |
| 3. Recovery after a failure      | 1:00–1:45 | [Execution graph](images/slide-03-execution-graph.png) | Both attempts, including the red failure, amber retry and green success. Crop away raw JSON.                       |
| 4. A history you can investigate | 1:45–2:30 | [Flight recorder](images/slide-04-flight-recorder.png) | Timeline covering failure, retry and success. Keep the replay controls if readable; omit the raw JSON panel.       |
| 5. Try the demo                  | 2:30–3:00 | [Demo Lab](images/slide-05-demo-lab.png)               | Top section and the first two scenarios. Crop the long mobile capture rather than shrinking it.                    |

The PNGs are unchanged copies of the screenshots already committed under `docs/screenshots/`. They show the working local release, rather than new captures of the Azure deployment. Crop their placement in Gamma; do not edit the event text, numbers or status colours. Keep the originals so you can adjust framing. No new screenshots are required for this short presentation.

### Suggested framing

Image coordinates below refer to the original PNGs, with `(0,0)` at the top left. They are framing suggestions for Gamma, not pre-cropped image files. Preserve aspect ratio and prioritise readable evidence over showing the entire application.

- **Slide 1, 1440 × 1000:** approximately x=240–1430, y=60–345. The lower chart and table contain loading/empty regions and should not appear on the slide.
- **Slide 3, 1440 × 1509:** approximately x=248–1416, y=335–868. This shows the complete graph and its two attempts without the raw JSON section.
- **Slide 4, 1440 × 1649:** approximately x=248–1416, y=515–1202 for a close view of the two attempts. If Gamma can comfortably show a larger crop, include the replay controls above; otherwise the slide text explains replay.
- **Slide 5, 390 × 2464:** approximately x=0–390, y=90–675. This shows the Demo Lab introduction, successful execution and transient failure. Use a narrow image beside the repository link.

## Create and record

1. Open Gamma and choose its AI creation flow. Paste the prompt; choose **Presentation** and **five slides/cards**. If using Paste mode, keep the five numbered slide sections intact. Gamma's interface may present this through its Agent creation flow instead.
2. Attach the four PNGs, or choose image placeholders and replace them after generation. Select a dark theme, minimal text and a 16:9 presentation format.
3. Check that Gamma used the actual screenshots, preserved the five-slide order and made the architecture diagram readable. Keep “costs are synthetic” visible where cost figures appear. Include the verified live Azure link on slide 5.
4. Copy each narration paragraph into the matching slide's speaker notes. Rehearse with the timer; the script is intended for about three minutes, including pauses.
5. Record the presented slides with your microphone. Capture the presentation window, not the private speaker notes. Save the narrated video separately from the Gamma deck.

Gamma references: [creation modes](https://help.gamma.app/en/articles/7838093-how-do-i-create-a-new-presentation-document-or-webpage-in-gamma), [Agent creation and image attachments](https://help.gamma.app/en/articles/15002203-how-do-i-create-with-agent-in-gamma), [speaker notes and timer](https://help.gamma.app/en/articles/11047307-can-i-use-speaker-notes-while-presenting-in-gamma).

## Content boundaries

This presentation describes the working project and its public Azure demo. Provider failures are deliberately simulated, execution records and screenshots are real, and mock costs are synthetic. Application budgets do not guarantee a cloud billing cap. Replay preserves the original history; external side effects are not promised to execute exactly once. Avoid production-readiness claims, invented adoption numbers, performance benchmarks or claims of private tenant isolation.

Technical sources: [project README](../../README.md), [architecture](../architecture.md), [reliability](../reliability.md), [replay](../replay.md), [demo scenarios](../../packages/application/src/demo.ts).

## Live Azure demo

The hosted demo is now verified at [https://agent-recorder-demo.canadacentral.cloudapp.azure.com](https://agent-recorder-demo.canadacentral.cloudapp.azure.com). For the existing Gamma deck, change slide 1 to “A working Azure demo”, slide 2's footer to “Azure demo: PostgreSQL + Service Bus + private Blob Storage; default provider: MockProvider”, and slide 5 to “Live demo hosted on Azure”, with the website link and repository link. The supplied screenshots remain historical local captures with synthetic costs. The updated prompt and narration reflect the deployed website.

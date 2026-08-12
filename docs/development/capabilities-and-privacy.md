# Capabilities & privacy

ZettelFlow discloses every capability it uses, ahead of Obsidian's upcoming **capability-label**
system (network / file system / clipboard / script execution). The plugin collects **no
telemetry** and transmits **no personal data or vault contents**.

## What the plugin accesses

| Capability | Used? | What for | How |
|---|---|---|---|
| **File system (vault)** | Always | Read your Canvas flow files; create and edit notes as the output of a flow; install community templates into your vault. | Obsidian's `Vault` API and `FileManager` — no hardcoded `.obsidian` paths, path-normalised, desktop **and** mobile. |
| **Network** | Opt-in | Only the **community templates** browser: fetch example flows/steps/actions and preview images from the ZettelFlow community source, and — if you configure one — your own community backend URL (authenticated with the token you set). | `request`/`requestUrl` in `src/application/community/`. No requests are made unless you open the community browser. |
| **AI provider (external)** | Opt-in, off by default | The optional **🤖 AI action category** (`summarize`, `classify`, `generate-questions`). When you enable it and run an AI action, the **note content** is sent to the single OpenAI-compatible endpoint **you configure** to get a completion back. | `requestUrl` in `src/architecture/ai/OpenAiCompatibleProvider.ts` only. No bundled key, no default endpoint, no other endpoint, no telemetry. Off by default — with the switch off, no AI request is ever made. See [AI provider setup](ai-provider-setup.md). |
| **Script execution** | Opt-in | The **Script** action and JavaScript step files execute **JavaScript you author** as part of a flow. | The `.js` code editor (`CodeView`) and the script action. Runs with the plugin's vault access — run only scripts you trust. |
| **Clipboard** | No | — | ZettelFlow does not read or write the system clipboard. |

## No telemetry

ZettelFlow does not embed analytics, crash reporting, or any phone-home. The only outbound
requests are the opt-in community fetches and the opt-in AI provider above. Nothing about your notes
leaves your machine unless *you* publish a template to a community backend you configured, or *you*
enable AI and run an AI action (which sends the note content only to the endpoint you set).

## The thinking-heatmap journal (local only)

The [thinking heatmap](thinking-heatmap.md) is fed by a **development-event journal** stored in the
plugin's own `data.json` as a **per-day count map** (`day → count`) — **no note names, no content**.
It is pruned to the last ~year and makes **no network request**. It is on by default (it only records
benign aggregate counts) and can be disabled under **Settings → ZettelFlow → Thinking journal**.

## Self-hosting the community backend

The optional [community backend](../architecture/community-and-backend.md) is a FastAPI service you
run yourself. Write endpoints require the `ZETTELFLOW_TOKEN` you set (matched against the plugin's
community token), and it ships with CORS and a `/health` route so it is safe to expose.

## Ahead of Obsidian's labels

Obsidian has announced machine-readable **disclosure labels** on the community hub. When that
format ships, ZettelFlow will adopt it so these capabilities are declared in the plugin manifest as
well as here. Until then, this page and the README section are the authoritative disclosure.

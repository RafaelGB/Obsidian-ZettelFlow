# Capabilities & privacy

ZettelFlow discloses every capability it uses, ahead of Obsidian's upcoming **capability-label**
system (network / file system / clipboard / script execution). The plugin collects **no
telemetry** and transmits **no personal data or vault contents**.

## What the plugin accesses

| Capability | Used? | What for | How |
|---|---|---|---|
| **File system (vault)** | Always | Read your Canvas flow files; create and edit notes as the output of a flow; install community templates into your vault. | Obsidian's `Vault` API and `FileManager` — no hardcoded `.obsidian` paths, path-normalised, desktop **and** mobile. |
| **Network** | Opt-in | Only the **community templates** browser: read-only `GET`s that fetch example flows/steps/actions/systems and preview images from the static ZettelFlow community catalog on GitHub raw. No backend, no account, no uploads. | `request`/`requestUrl` in `src/application/community/`. No requests are made unless you open the community browser. |
| **AI provider (external)** | Opt-in, off by default | The optional **🤖 AI action category** (`summarize`, `classify`, `generate-questions`, …). When you enable it and run an AI action, the **(length-bounded) note content** is sent to the single **https** OpenAI-compatible endpoint **you configure** to get a completion back. AI never fires on its own in automations unless you opt in. | `requestUrl` in `src/architecture/ai/OpenAiCompatibleProvider.ts` only. No bundled key, no default endpoint, no other endpoint, no telemetry. Off by default; input/output are capped and the endpoint must be https (or localhost). See [AI provider setup](ai-provider-setup.md). |
| **Clipboard** | On your click | **Writes only, never reads.** The “copy” buttons put a step / action / canvas-node configuration on the clipboard as JSON so you can paste it elsewhere or share it. | `navigator.clipboard.writeText` in the step, action and canvas-node editors. Nothing is ever read from your clipboard, and nothing is copied unless you press a copy button. |
| **Vault enumeration** | Always | Lists every markdown file **path** in the vault to build the offline knowledge model that every analysis reads (health, discovery, the graph, Cultivate). | `vault.getMarkdownFiles()` via the `ObsidianApi` facade. Paths and metadata only, all local, no network. You can keep folders out of it entirely with the [knowledge scope](knowledge-scope.md). |
| **Dynamic code execution** | Opt-in | Runs the JavaScript **you** author: the Script action, dynamic selectors, vault hooks and workflow-event conditions. | Built in exactly **one** module, `architecture/api/lib/FnConstructor.ts` (a guardrail test fails the build if a second site appears). No remote code is ever fetched or executed — only code stored in your own vault or settings. |
| **Judgement record** | On by default | Stores the decisions you make on your own ideas — accept / modify / reject / confirm / challenge — so [cognitive agency](cognitive-agency.md) can be derived instead of invented. | A local, bounded log (most recent 500) in the plugin's `data.json`: a note path, a short locale-free subject id, an origin and a verdict. **No note content, no AI output**, no network. Honours the [knowledge scope](knowledge-scope.md) and can be turned off. |

## What the automated scan sees that is not ours

Obsidian's Community-hub scan reports **runtime base64 encode/decode**. That call does not come from
ZettelFlow code — there is no `atob`/`btoa` anywhere in `src/`. It comes from the bundled 3D graph
library (`3d-force-graph`, which vendors three.js loaders) used by the graph view. It decodes assets
the library ships with; it does not encode anything about your vault, and it makes no request.

## No telemetry

ZettelFlow does not embed analytics, crash reporting, or any phone-home. The only outbound
requests are the opt-in community fetches (read-only) and the opt-in AI provider above. Nothing about
your notes leaves your machine unless *you* enable AI and run an AI action (which sends the note
content only to the endpoint you set). Sharing a template is a manual GitHub contribution you make
yourself — the plugin never uploads anything.

## The thinking-heatmap journal (local only)

The [thinking heatmap](thinking-heatmap.md) is fed by a **development-event journal** stored in the
plugin's own `data.json` as a **per-day count map** (`day → count`) — **no note names, no content**.
It is pruned to the last ~year and makes **no network request**. It is on by default (it only records
benign aggregate counts) and can be disabled under **Settings → ZettelFlow → Thinking journal**.

## The community gallery is static

The [community gallery](../architecture/community.md) is **fully static**: the plugin only ever does
read-only `GET`s of catalog files from GitHub raw. There is no backend, no account, and the plugin
never uploads anything — contributions are made through GitHub (an issue form + a PR).

## Ahead of Obsidian's labels

Obsidian has announced machine-readable **disclosure labels** on the community hub. When that
format ships, ZettelFlow will adopt it so these capabilities are declared in the plugin manifest as
well as here. Until then, this page and the README section are the authoritative disclosure.

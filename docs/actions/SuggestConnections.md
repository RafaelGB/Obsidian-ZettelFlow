# Suggest connections action

🤖 An **AI** action (#184) — the AI counterpart to the deterministic 🔗
[Suggest link](SuggestLink.md) (#154). The model proposes notes or topics worth linking from the
note being built. **Optional and off by default** — see
[AI provider setup](../development/ai-provider-setup.md).

## Options

- **Result property** — where the suggestions are written (default `suggestedConnections`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).

## Result

A list of connection suggestions (parsed from the provider's response — one per line, list markers
stripped), plus a `Notice` with the count. If AI is disabled or not configured, the action no-ops
with a clear notice and makes no network request; a provider/network failure degrades to a notice
with nothing written.

> **Deterministic alternative:** [Suggest link](SuggestLink.md) ranks link candidates from your own
> graph, offline and with no AI. Use it when you want reproducible, network-free suggestions.

## Capabilities

Sends the **note content** to the single AI endpoint you configure (opt-in). No bundled key, no
telemetry, no other endpoint. See [Capabilities & privacy](../development/capabilities-and-privacy.md).

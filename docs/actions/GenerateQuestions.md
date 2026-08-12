# Generate questions action

🤖 An **AI** action (#156). Generates the open questions the note being built raises, via your
configured AI provider. **Optional and off by default** — see
[AI provider setup](../development/ai-provider-setup.md).

## Options

- **Result property** — where the questions are written (default `questions`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).

## Result

A list of questions (parsed from the provider's response — one per line, list markers stripped),
plus a `Notice` with the count. If AI is disabled or not configured, the action no-ops with a clear
notice and makes no network request; a provider/network failure degrades to a notice with nothing
written.

## Capabilities

Sends the **note content** to the single AI endpoint you configure (opt-in). No bundled key, no
telemetry, no other endpoint. See [Capabilities & privacy](../development/capabilities-and-privacy.md).

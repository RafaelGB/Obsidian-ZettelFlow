# Classify action

🤖 An **AI** action (#156). Suggests topic tags for the note being built via your configured AI
provider. **Optional and off by default** — see
[AI provider setup](../development/ai-provider-setup.md).

## Options

- **Result property** — where the tags are written (default `classification`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).

## Result

An array of short tag labels (parsed from the provider's response — trimmed, de-duplicated), plus a
`Notice` with the count. If AI is disabled or not configured, the action no-ops with a clear notice
and makes no network request; a provider/network failure degrades to a notice with nothing written.

## Capabilities

Sends the **note content** to the single AI endpoint you configure (opt-in). No bundled key, no
telemetry, no other endpoint. See [Capabilities & privacy](../development/capabilities-and-privacy.md).

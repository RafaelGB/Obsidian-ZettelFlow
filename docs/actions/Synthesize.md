# Synthesize action

🤖 An **AI** action (#184). Combines the notes the current note **links to** (`[[wikilinks]]`) into a
single synthesis — the common threads, the tensions, and what they add up to — via your configured AI
provider. **Optional and off by default** — see [AI provider setup](../development/ai-provider-setup.md).

## Options

- **Result property** — where the synthesis is written (default `synthesis`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).

## Result

A prose synthesis across the linked notes, plus a `Notice` with the number of sources used. Up to
**five** linked notes are read (best-effort — unresolved links are skipped). If no links resolve, the
action no-ops with nothing written. If AI is disabled or not configured, it no-ops with a clear notice
and makes no network request; a provider/network failure degrades to a notice with nothing written.

## Capabilities

Unlike the other AI actions, `synthesize` **reads the content of the notes this note links to** (never
modifying them) and sends **that content plus the note being built** to the single AI endpoint you
configure (opt-in). No bundled key, no telemetry, no other endpoint. See
[Capabilities & privacy](../development/capabilities-and-privacy.md).

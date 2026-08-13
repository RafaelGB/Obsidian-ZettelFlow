# Challenge idea action

🤖 An **AI** action (#184). Argues against the note's thesis — surfacing its weakest points, hidden
assumptions and the strongest counterarguments — via your configured AI provider. **Optional and off
by default** — see [AI provider setup](../development/ai-provider-setup.md).

## Options

- **Result property** — where the challenge is written (default `challenge`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).

## Result

A prose critique of the note (the raw provider response), plus a `Notice`. If AI is disabled or not
configured, the action no-ops with a clear notice and makes no network request; a provider/network
failure degrades to a notice with nothing written.

## Capabilities

Sends the **note content** to the single AI endpoint you configure (opt-in). No bundled key, no
telemetry, no other endpoint. See [Capabilities & privacy](../development/capabilities-and-privacy.md).

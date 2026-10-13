# Suggest connections

Suggest notes worth linking with AI (the AI counterpart to suggest link).

*Called `suggest-connections` in the step's YAML.*

An **AI** action. It asks nothing in the wizard except your verdict. The model proposes notes or topics worth
linking from the note being built. **Optional and off by default** — see
[AI provider setup](../development/ai-provider-setup.md).

## Settings

- **Result property** — where the result is written. Default: `suggestedConnections`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{suggestedConnections}}`.

## What it writes

A list of suggestions, one per line of the answer (list markers removed):

```yaml
---
suggestedConnections:
  - Testing effect
  - Desirable difficulties
---
```

A notice reports the count. If AI is turned off or not set up, the action does nothing, shows a
notice and makes no network request; a provider or network failure shows a notice and writes
nothing.

> **Without AI:** [Suggest link](SuggestLink.md) ranks link candidates from your own graph, offline.
> Use it when you want the same suggestions every time, with no network.

## Nothing is written until you decide

The AI's answer is a proposal. A window shows it as **Proposed text**: change it if it is not right,
then **Accept** (it reads **Save my edit** once you have changed it) or **Reject**. You can add
**Why (optional)** and **How sure are you?**; both are recorded with your verdict and never written
to the note. Closing the window writes nothing. AI actions never run in automations — only in a
build you drive yourself.

## Capabilities

Sends the **note content** to the single AI endpoint you configure (opt-in). No bundled key, no
telemetry, no other endpoint. See [Capabilities & privacy](../development/capabilities-and-privacy.md).

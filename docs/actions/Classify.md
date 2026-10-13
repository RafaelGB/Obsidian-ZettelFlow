# Classify

Suggest topic tags for the note with AI.

*Called `classify` in the step's YAML.*

An **AI** action. It asks nothing in the wizard except your verdict. **Optional and off by default** — see
[AI provider setup](../development/ai-provider-setup.md).

## Settings

- **Result property** — where the result is written. Default: `classification`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{classification}}`.

## What it writes

A list of short topic labels (trimmed, de-duplicated):

```yaml
---
classification:
  - learning
  - memory
---
```

A notice reports the count. If AI is turned off or not set up, the action does nothing, shows a
notice and makes no network request; a provider or network failure shows a notice and writes
nothing.

## Nothing is written until you decide

The AI's answer is a proposal. A window shows it as **Proposed text**: change it if it is not right,
then **Accept** (it reads **Save my edit** once you have changed it) or **Reject**. You can add
**Why (optional)** and **How sure are you?**; both are recorded with your verdict and never written
to the note. Closing the window writes nothing. AI actions never run in automations — only in a
build you drive yourself.

## Capabilities

Sends the **note content** to the single AI endpoint you configure (opt-in). No bundled key, no
telemetry, no other endpoint. See [Capabilities & privacy](../development/capabilities-and-privacy.md).

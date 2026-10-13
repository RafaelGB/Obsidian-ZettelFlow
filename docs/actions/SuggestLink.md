# Suggest link

Surface the top link suggestions for the note from shared graph context.

*Called `suggest-link` in the step's YAML.*

A **Relations** action. It asks nothing in the wizard. Same structural ranking as
[Find related](FindRelated.md), with a smaller default — framed as *links you might want to add*.
Deterministic and offline.

## Settings

- **Result property** — where the suggested links are written. Default: `suggestedLinks`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{suggestedLinks}}`.
- **Source note (optional)** — the note to rank against. Empty uses the note being built.
- **Max results** — how many suggestions to keep, strongest first. Default: `5`.

## What it writes

```yaml
---
suggestedLinks:
  - "[[Spaced repetition]]"
---
```

A notice reports the count. As with Find related, the note being built is not indexed yet — point
**Source note (optional)** at an existing note to get suggestions. If the index isn't ready, the
action does nothing.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

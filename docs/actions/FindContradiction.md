# Find contradictions

List notes linked to this one by a contradicts relation.

*Called `find-contradiction` in the step's YAML.*

A **Knowledge** action. It asks nothing in the wizard. It reads the note's
[`contradicts` relations](../architecture/knowledge-model.md), in both directions — no text or AI
inference. Deterministic and offline.

## Settings

- **Result property** — where the list of links is written. Default: `contradictions`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{contradictions}}`.
- **Target note (optional)** — the note to analyze. Empty uses the note being built.

## What it writes

```yaml
---
contradictions:
  - "[[Coffee is not healthy]]"
---
```

A notice reports the count. An empty list is a valid (and common) result. If the index isn't ready
or the note isn't indexed, the action does nothing.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

# Detect orphan

Flag whether the note has no incoming or outgoing links (an orphan).

*Called `detect-orphan` in the step's YAML.*

A **Knowledge** action. It asks nothing in the wizard. It reads the in-memory
[knowledge model](../architecture/knowledge-model.md), never the network.

## Settings

- **Result property** — the property (or context key) the result is written to. Default: `orphan`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use the result as
  `{{<result property>}}`, e.g. `{{orphan}}`.
- **Target note (optional)** — the note to analyze. Empty uses the note being built.

## What it writes

`true` when the note has no links in or out, `false` otherwise:

```yaml
---
orphan: true
---
```

If the knowledge index isn't ready yet, or the note isn't indexed (a brand-new note that hasn't been
written yet), the action does nothing — it never blocks the flow.

## Where it fits

Usable in the note-builder wizard and in [event-driven workflows](../architecture/event-driven-workflows.md).

## Capabilities

File-system read (the model) + the disclosed result-property write. **No network, no AI.**

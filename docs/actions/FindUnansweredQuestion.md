# Find unanswered questions

List questions this note raises that nothing answers yet.

*Called `find-unanswered-question` in the step's YAML.*

A **Knowledge** action. It asks nothing in the wizard. It reads the note's outgoing
[`question` relations](../architecture/knowledge-model.md) whose question has no incoming `supports`
relation yet. Deterministic and offline.

## Settings

- **Result property** — where the list of links is written. Default: `unanswered-questions`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{unanswered-questions}}`.
- **Target note (optional)** — the note to analyze. Empty uses the note being built.

## What it writes

```yaml
---
unanswered-questions:
  - "[[Why do people stop reviewing notes]]"
---
```

A notice reports the count. As soon as a `supports` relation points into a question, it drops off the
list. If the index isn't ready or the note isn't indexed, the action does nothing.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

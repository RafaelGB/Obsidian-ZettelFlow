# Find sources

Suggest existing vault sources for an under-sourced note.

*Called `find-sources` in the step's YAML.*

A **Research** action. It asks nothing in the wizard. For a note with no source, it suggests
**sources already in your vault** — first those cited by the note's graph neighbours, then the most
cited ones ([knowledge model](../architecture/knowledge-model.md)). **Vault-only and offline — not a
web search.**

## Settings

- **Result property** — where the candidate sources are written. Default: `candidateSources`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{candidateSources}}`.
- **Source note (optional)** — the note to suggest sources for. Empty uses the note being built.
- **Max results** — how many candidate sources to keep, most-referenced first. Default: `5`.

## What it writes

```yaml
---
candidateSources:
  - "[[Make it stick]]"
  - https://doi.org/10.1037/a0021797
---
```

A notice reports the count. **The note must have no source yet** — an already-sourced or unknown note,
or an empty vault index, gives an empty result. If the index isn't ready, the action does nothing.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

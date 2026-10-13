# Extract claims

Surface the claims and sources a note declares.

*Called `extract-claims` in the step's YAML.*

A **Research** action. It asks nothing in the wizard. It reads the claims and sources the
[knowledge model](../architecture/knowledge-model.md) parsed from the note. Read-only,
deterministic, offline.

## Settings

- **Result property** — where the extracted claims are written. Default: `claims`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{claims}}`.
- **Source note (optional)** — the note to read. Empty uses the note being built.

## What it writes

An object with the claim texts and the note's sources (a note source as a `[[wikilink]]`, free text
as written):

```yaml
---
claims:
  claim:
    - Spaced review beats rereading
  source:
    - "[[Make it stick]]"
---
```

A notice reports the claim count. A note with no claims gives an empty result. If the index isn't
ready, the action does nothing.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

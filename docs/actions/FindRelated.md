# Find related

Rank notes worth linking by shared graph context (co-citation and coupling).

*Called `find-related` in the step's YAML.*

A **Relations** action. It asks nothing in the wizard. It reads only the
[knowledge model](../architecture/knowledge-model.md): relatedness is purely structural, with no
text or AI inference. Deterministic and offline.

## Settings

- **Result property** — where the ranked list of links is written. Default: `related`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{related}}`.
- **Source note (optional)** — the note to rank against. Empty uses the note being built.
- **Max results** — how many suggestions to keep, strongest first. Default: `10`.

## What it writes

```yaml
---
related:
  - "[[Spaced repetition]]"
  - "[[Writing to think]]"
---
```

A notice reports the count. An empty list is a valid result — in particular, **the note being built
is not indexed yet**, so ranking it before it exists finds nothing; point **Source note (optional)**
at an existing note to get suggestions. If the index isn't ready, the action does nothing.

## How the ranking works

For each candidate note the score combines two graph signals:

- **Co-citation** (weight 2) — how many notes link to **both** the source and the candidate.
- **Bibliographic coupling** (weight 1) — how many notes the source and the candidate **both** link
  to.

`score = 2·co-citation + 1·coupling`. The source itself, notes already linked to it (either
direction) and candidates with a score of 0 are left out. Ties are broken by path.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

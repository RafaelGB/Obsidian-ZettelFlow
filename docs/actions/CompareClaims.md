# Compare claims

Find notes whose claims agree with or contradict this note's claims.

*Called `compare-claims` in the step's YAML.*

A **Research** action. It asks nothing in the wizard. It compares claims over the
[knowledge model](../architecture/knowledge-model.md). Deterministic and offline — **no AI text
similarity**.

## Settings

- **Result property** — where the comparison is written. Default: `claimComparison`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{claimComparison}}`.
- **Source note (optional)** — the note to compare. Empty uses the note being built.

## What it writes

```yaml
---
claimComparison:
  agreeing:
    - "[[Testing effect]]"
  contradicting:
    - "[[Rereading works]]"
---
```

Each list is de-duplicated and sorted by path. A notice reports both counts. Empty lists are a valid
result. If the index isn't ready, the action does nothing.

## How comparison works

- **Agreement** — another note makes the **same** claim, once normalized (trimmed, lower-case,
  whitespace collapsed, surrounding quotes and trailing punctuation removed).
- **Contradiction** — either:
    1. **Structural** — the two notes are joined by a `contradicts`
       [relation](../architecture/knowledge-model.md), in either direction; their claims are paired
       regardless of text.
    2. **Textual negation** — the *same* sentence with opposite polarity, from a fixed set of
       markers (`not · no · never · n't · nunca · jamás · tampoco`).

!!! note "Limitation"
    The textual rule catches clean flips where the rest of the sentence is identical (*"coffee is
    healthy"* vs *"coffee is not healthy"*). For anything subtler, declare a `contradicts` relation
    with [Create semantic relation](CreateSemanticRelation.md).

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

# Compare claims action

🔍 A **Research** action (#155). Given a note, surfaces which other notes' claims **agree with** or
**contradict** its claims, over the [knowledge model](../architecture/knowledge-model.md) (#145).
Deterministic and offline — **no text-similarity AI**.

## How comparison works

- **Agreement** — another note asserts the **identical** claim once normalized (trim, lower-case,
  collapse whitespace, strip surrounding quotes and trailing punctuation).
- **Contradiction** — either:
  1. **Structural** — the two notes are joined by a `contradicts` [semantic relation](../architecture/knowledge-model.md)
     (#147, either direction); the paired claims are flagged regardless of text.
  2. **Textual negation** — the *same* proposition asserted with opposite polarity, over a fixed,
     closed bilingual marker set (`not · no · never · n't · nunca · jamás · tampoco`).

!!! note "Limitation"
    The textual rule catches clean polarity flips where the rest of the sentence is otherwise
    identical (e.g. *"coffee is healthy"* vs *"coffee is not healthy"*). Richer grammatical negation
    relies on the structural `contradicts` relation — declare it with the
    [create semantic relation](CreateSemanticRelation.md) action for reliable results.

## Options

- **Result property** — where the comparison is written (default `claimComparison`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Source note (optional)** — the note to compare; empty ⇒ the note being built.

## Result

A `{ agreeing: [...], contradicting: [...] }` object — each a deduped, path-sorted list of
`[[wikilinks]]` to the matching notes — plus a `Notice` with the two counts. Empty sets are a valid
result. If the index isn't ready, the action safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

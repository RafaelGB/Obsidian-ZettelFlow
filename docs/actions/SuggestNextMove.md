# Suggest next move action

🧠 A **Knowledge** action (#158). Proposes the most useful **next moves** to develop the target note,
from its position in the [knowledge model](../architecture/knowledge-model.md) — turning the maturity
signals (#153) into a concrete to-do. **Relation- and signal-based, no text or AI inference.**
Deterministic and offline.

## The moves

Returned in a fixed priority order, only those whose precondition holds:

| Move | When it fires |
|---|---|
| **Add a source** | the note makes a claim but cites no source |
| **Connect it to a related note** | the note has no outgoing links |
| **Add an example** | the note is connected but declares no `example` relation (#147) |
| **Develop it toward the next state** | the note is in an early lifecycle state (not yet permanent/evergreen) |

A note that triggers none of these is **well developed** — the action writes an affirming message
instead of a to-do.

## Options

- **Result property** — where the suggested moves are written (default `nextMoves`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Target note (optional)** — the note to assess; empty ⇒ the note being built.

## Result

An array of short, sentence-case suggestions (or the "well developed" affirmation), plus a `Notice`.
It composes naturally after the maturity score: [calculate maturity](CalculateMaturity.md) says *how*
mature, this says *what to do next*. If the index isn't ready or the note isn't indexed, the action
safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

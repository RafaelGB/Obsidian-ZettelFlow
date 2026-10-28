# Suggest next move

Suggest the most useful next action to develop this note.

*Called `suggest-next-move` in the step's YAML.*

A **Knowledge** action. It asks nothing in the wizard. It turns the note's place in the
[knowledge model](../architecture/knowledge-model.md) into a concrete to-do — no text or AI inference.
Deterministic and offline.

## Settings

- **Result property** — where the suggested moves are written. Default: `nextMoves`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{nextMoves}}`.
- **Target note (optional)** — the note to assess. Empty uses the note being built.

## The moves

In this order, only those that apply:

| Move | When |
|---|---|
| **Add a source** | the note makes a claim but cites no source |
| **Connect it to a related note** | the note has no outgoing links |
| **Develop it toward the next state** | the note is in an early lifecycle state (not yet permanent or evergreen) |

A note that needs none of these gets *"Well developed — no action needed."* instead.

## What it writes

```yaml
---
nextMoves:
  - Add a source
  - Connect it to a related note
---
```

A notice reports the count. It pairs with [Calculate maturity](CalculateMaturity.md): that one says
*how* mature, this one says *what to do next*. If the index isn't ready or the note isn't indexed, the
action does nothing.

## Finish it in place

The same suggestion drives **This note**'s [Actions on this note](../development/this-note.md#actions-on-this-note):
it lists the open steps together and lets you finish each one — add the source, link the note, move
the state on — without leaving the sidebar, with an undo.

*Add an example* is no longer a move (#891): nobody understood it, and it asked for an `example`
relation in the opposite direction to the one the relation vocabulary uses. A note that still has
`Add an example` in its `nextMoves` from an older run keeps it until the action runs again. The
`example` **relation** itself is unchanged — [Create semantic relation](CreateSemanticRelation.md) still
writes it, and This note's neighbourhood still colours it.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

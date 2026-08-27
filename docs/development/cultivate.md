# Cultivate — thinking sessions

> *ZettelFlow is an engine that makes knowledge evolve.* Cultivate is that engine made a daily
> practice: a short, guided **thinking session** that takes one idea and makes it measurably more
> connected and mature (#309).

Where the canvas wizard and quick-capture serve **creation**, and the dashboards serve **diagnosis**,
Cultivate serves the middle of the lifecycle — `DEVELOP → REVIEW → CONSOLIDATE` — that used to be
passive. It doesn't just *tell* you what to do; it *walks you through doing it*.

## Starting a session

- **Home surface → Cultivate mode**, the **`Cultivate — start a thinking session`** command, or the
  ribbon menu (🌱). Home also shows a **Cultivate teaser** with how many ideas still have room to grow.
- ZettelFlow picks the **highest-leverage** idea (well-connected yet under-developed, via the same
  `nextSession` heuristic Home uses). **Another idea** moves on to the next one.

## The moves

Each move is a real, one-click operation on the target note — nothing is invented:

| Move | What it does | Reuses |
|---|---|---|
| **Connect** | link an unlinked note that shares this one's context | find-related (#154) |
| **Challenge** | show its contradictions, or capture your own counterpoint | find-contradiction (#153) |
| **Question** | capture an open question it raises (a `question::` field) | inline fields (#153) |
| **Advance** | move it to the next **lifecycle state** (validated transition) | state machine (#158) |
| **Add a source** | ground it in a reference (`source` frontmatter) | sources (#155) |

The session **refines live**: after you link a note the connect list shrinks; after you advance the
state the next state is proposed. The header shows the idea's **degree** and **maturity** — the
before/after is a *consequence* of the moves, never an invented score. Advancing a state (or adding a
source/connection) also records a **development event** for the [thinking heatmap](thinking-heatmap.md).

## Principles

- **Offline-first.** Every move is graph-derived. The optional AI actions (challenge-idea, synthesize)
  are never required — Cultivate works fully without them.
- **Layering.** The session is a pure projection (`buildCultivationSession`, re-exported from the
  Knowledge State surface); the writes live in a Workflow-Engine `CultivationService`, so the
  Experience view only reads state (the #266 guard).

## Architecture

```
architecture/knowledge/cultivate/cultivationSession.ts   (pure: session + target + readyToCultivate)
  → re-exported via architecture/knowledge/state
architecture/plugin/services/CultivationService.ts        (the writes: link / question / counterpoint / source / advance)
architecture/components/core/cultivate/CultivateModeRenderer.ts  (the Cultivate mode on the Home surface)
```

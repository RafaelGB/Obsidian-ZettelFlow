# Event-driven workflows

> **Status:** opt-in, **off by default**. Introduced in #150 (Knowledge OS epic, Workflow-Engine
> layer). This is the first ZettelFlow feature that lets a flow run **without a manual launch**.

Normally a flow runs because you asked — the ribbon icon, the **Open workflow** command, or a
vault hook on the active file. Event-driven workflows let a flow **react** to what happens in the
vault instead: a note being created can auto-start a flow, a property flip can advance a piece of
knowledge. This turns Obsidian from a store you operate into a system that helps knowledge evolve.

Because a flow that runs on its own is powerful (and potentially surprising), the feature is
**disabled by default**, **throttled**, and **loop-guarded** — a flow can never retrigger itself.

## Turning it on

**Settings → ZettelFlow → Event-driven workflows → Enable event-driven workflows.**

With the toggle **off** (the default) no listeners are registered and no flow can fire — behaviour
is byte-for-byte identical to a ZettelFlow without this feature. Toggling arms/disarms the
listeners immediately; no reload is needed. Everything is torn down on plugin unload (no leaks).

## The trigger vocabulary

A flow reacts to one **event**. The vocabulary is fixed; v1 **wires** the cheap, deterministic four
and reserves the rest for a later slice:

| Event | Fires when | v1 |
|---|---|---|
| `note.created` | a markdown note is created | ✅ wired |
| `note.modified` | a markdown note's content changes | ✅ wired |
| `property.changed` | a frontmatter property's value changes | ✅ wired |
| `tag.added` | a tag is added to a note's frontmatter | ✅ wired |
| `note.linked` / `note.unlinked` | a link is added/removed | ⏳ reserved |
| `workflow.completed` | a workflow finishes | ⏳ reserved |
| `review.due` | a note's review cadence lapses | ⏳ reserved |

`property.changed` and `tag.added` have no native Obsidian signal — they are **derived**
deterministically from a frontmatter/tag snapshot diff (the same approach the property hooks use).

## Authoring a trigger (v1)

A binding lives in the **root step's `zettelFlowSettings` frontmatter**, so the trigger **travels
with the flow** — install a methodology package from the community gallery and its triggers come
with it. v1 ships **no visual authoring** (that is the visual WHEN/IF/ACTION/WAIT language, a later
slice); you write the trigger by hand in the root step file:

```yaml
---
zettelFlowSettings:
  root: true
  label: Fleeting inbox
  trigger:
    event: note.created
    condition: "return event.notePath.startsWith('Inbox/')"  # optional
    enabled: true                                              # optional; omit = enabled
---
```

- **`event`** — one of the wired tokens above.
- **`condition`** *(optional)* — a `zf` script; the binding fires only when it returns a truthy
  value. It receives the event payload as `event` and the `zf` script API as `zf` (the same
  evaluator behind property hooks and the Script action). **Absent = always fire.** A condition
  that throws or is invalid is caught and the binding is **skipped safely** — it never breaks the
  vault.
- **`enabled`** *(optional)* — set `false` to keep the trigger but switch it off.

The **Settings → Event-driven workflows** panel lists every configured trigger. For a trigger on a
file-node root you can toggle it on/off or remove it there; for a trigger embedded in a canvas
node, use the *open flow* action and edit it in the canvas.

## Safety model

| Guard | What it does |
|---|---|
| **Off by default** | No listeners until you opt in; a fresh install fires nothing. |
| **Throttle** | Per binding **per note**, a few seconds — a burst (sync, bulk import, folder move) collapses to at most one run per note per window. |
| **Loop guard** | A workflow's own writes are recognised (via the `VaultStateManager` freeze/on-process state) and **suppressed**, plus a bounded depth cap — so a flow that writes the note that triggered it cannot loop. |
| **Same execution path** | A bound flow runs through the **same** entry a manual run uses — identical note output, no parallel code path. |
| **Lifecycle-owned** | Every listener and timer is removed on disable and on plugin unload. |

## Caveats

- **Conditions run synchronously.** A binding's `condition` is a `zf` script with **no timeout** —
  the same execution model as property hooks and the Script action. Keep it cheap: a heavy or
  infinite condition blocks Obsidian's UI thread. Prefer a small predicate over the note's
  frontmatter/path.
- **`note.modified` can be noisy.** A binding on `note.modified` with a broad or absent condition
  opens the wizard on *every* qualifying edit (throttled to at most once per note per window).
  Scope it with a condition, or prefer `note.created` / `property.changed` where you can.

## Capabilities & privacy

Event-driven workflows observe vault **file/metadata events** (file-system reads) and, on a fire,
run a flow that may **create/modify notes** (file-system writes) — both within ZettelFlow's already
disclosed file-system capability. A binding condition runs as a **`zf` script**, reusing the
already-disclosed script-execution capability (the same evaluator as hooks / the Script action). No
network calls, no AI — event-driven execution is fully local.

## Visual workflow language (WHEN / IF / ACTION / WAIT)

Event-driven workflows compose on the **native canvas** as a small, readable language — *WHEN* a
vault event happens, *IF* a condition holds, run an *ACTION*, then *WAIT* for you. Each block lowers
onto a primitive ZettelFlow already runs, so there is **one execution path** (the engine above), not
a second runtime:

| Block | Is | Where it lives |
|---|---|---|
| **WHEN** | the event trigger | the root step's `zettelFlowSettings.trigger` — author it in the step builder's *When (event trigger)* field |
| **IF** | a conditional branch | an `if: …` canvas edge label ([conditional edges](conditional-edges.md)) |
| **ACTION** | a step to run | an ordinary Step node, authored with the step builder |
| **WAIT** | a human-confirmation pause | a new additive `wait` marker on a step — toggle *Wait for confirmation* in the step builder, or *Mark as a wait step* from the canvas node menu |

### WAIT — the human-in-the-loop pause

When the wizard reaches a WAIT step it **suspends** and shows a prompt: **Continue** resumes the
workflow, **Cancel** (or closing the prompt) aborts it. Nothing is written until the workflow
finishes, so a cancelled or dropped WAIT leaves the vault untouched. v1 WAIT is **human confirmation
only** and has **no cross-restart persistence** — a WAIT still pending when Obsidian closes is simply
dropped (it fails safe: no half-built note). Keep it out of unattended, event-triggered flows unless
a person is there to answer.

### In-canvas legibility

On a ZettelFlow canvas the blocks are **visually annotated** by kind — WAIT nodes badged, WHEN
(trigger) roots and IF edges marked — so a flow reads as an arc of thinking at a glance. This styling
is **cosmetic only**: it changes nothing about execution or storage, and if Obsidian's canvas
internals change it simply doesn't apply (the workflow still runs).

### Safety

A visually-authored workflow inherits every guard above: **off by default**, **throttled**, and
**loop-guarded** — a WAIT pause never defeats the loop guard (a resumed run's own write is still
suppressed). An IF condition reuses the safe [#119 evaluator](conditional-edges.md) (no `eval`); a
malformed condition **safe-opens** the branch rather than silently dropping it.

## See also

- [Vault hooks internals](vault-hooks-internals.md) — property/folder hooks fire from the same
  vault signals this engine observes.
- [Knowledge lifecycle](knowledge-lifecycle.md) — a note's **state** (its maturity) is orthogonal
  to a step's **phase** and to these trigger **events**.

## Where an event flow lives, and where a trigger can be written (#436)

An event flow is a canvas in the **events folder** (Settings → Your flows → *Events folder*). That
is the switch: a flow reacts to vault events because it lives there, and stops when it moves out.
The old global *enable event-driven workflows* toggle is gone — it gated everything at once, which
told you nothing about which flow would run.

A **trigger can only be written where it can fire**: on the **first step** (the root) of an event
flow. Anywhere else the step editor shows no trigger section at all, because the engine reads a
trigger from exactly one place and every other switch was disconnected. Two exceptions keep that
honest:

- on a non-root step of an event flow, the editor says the start owns the trigger and offers one
  click to **make this step the start**;
- a trigger that is **already stored** anywhere is always shown, with the reason it cannot fire and
  a control to remove it. Configuration never becomes invisible.

### Breaking change in 3.4: one home, no legacy scan

Until 3.4 the engine scanned the **folder-flows** folder for triggers, so a canvas there was both
the automation of a folder (by its filename) and an event flow (if its root carried a trigger).
That is gone, deliberately and without a compatibility path: **only the events folder is scanned**.

If you had a flow that fired from the old location, move it into the events folder — Settings →
*Your flows* → set its role to *runs on an event*, which moves the file for you and says so first.
Until you do, it does not fire.

The global *enable event-driven workflows* switch is also gone, along with its stored value: it
gated everything at once and said nothing about which flow would run. A flow reacts to events
because it lives in the events folder; moving it out is how you turn it off.

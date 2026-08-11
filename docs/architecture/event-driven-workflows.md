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

## Capabilities & privacy

Event-driven workflows observe vault **file/metadata events** (file-system reads) and, on a fire,
run a flow that may **create/modify notes** (file-system writes) — both within ZettelFlow's already
disclosed file-system capability. A binding condition runs as a **`zf` script**, reusing the
already-disclosed script-execution capability (the same evaluator as hooks / the Script action). No
network calls, no AI — event-driven execution is fully local.

## See also

- [Vault hooks internals](vault-hooks-internals.md) — property/folder hooks fire from the same
  vault signals this engine observes.
- [Knowledge lifecycle](knowledge-lifecycle.md) — a note's **state** (its maturity) is orthogonal
  to a step's **phase** and to these trigger **events**.

# Workflow phases

> Part of Layer 2 (Workflow Engine) of the [Knowledge OS epic (#144)](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/144).
> A **phase** reframes a Step from "do an operation on a note" to "advance a piece of knowledge".

A step can carry an optional **phase** — the stage of knowledge work it advances. Phases turn a flow
into a readable arc of thinking instead of a list of file operations.

```mermaid
flowchart LR
    CAPTURE --> CLASSIFY --> PROCESS --> CONNECT --> DEVELOP --> REVIEW --> CONSOLIDATE
```

| Phase | What the step does |
|---|---|
| **Capture** | Grab a raw thought or input before it slips away |
| **Classify** | Decide what kind of note this is and where it belongs |
| **Process** | Work the material into your own words |
| **Connect** | Link this idea to what you already know |
| **Develop** | Grow the idea with evidence, examples and questions |
| **Review** | Revisit and refine the idea over time |
| **Consolidate** | Settle the idea into a durable, evergreen note |

## Phase vs. state — two orthogonal axes

Do not confuse a step **phase** with a note **[lifecycle state](knowledge-lifecycle.md)** (#146):

- A **phase** lives on a **Step** — the *kind of work* a step performs in a flow.
- A **state** lives on a **note** — *how mature* that piece of knowledge is (Fleeting → … → Archived).

They are independent: a "Develop"-phase step might advance a note from `permanent` to `developing`,
but the two vocabularies never mix.

## Design (#149)

- **Fixed taxonomy.** The seven phases above are a closed, ordered set. Custom phases are deferred.
- **Per-step & optional.** `phase?: StepPhase` is additive metadata on `StepSettings`. Absence means
  *unphased* — there is **no migration**, and a legacy flow with no phases loads, lists, runs and
  saves exactly as before.
- **Cosmetic only.** In #149 the phase only **labels and groups** steps in the builder and the step
  selector; it does **not** influence execution or ordering. (Event-driven and conditional execution
  are later Layer-2 issues.)
- **Stored value** is the ASCII token (`CAPTURE`, `PROCESS`, …); the label is localized for display.
- The step builder groups options by phase (in canonical order, with an **Unphased** group last) only
  when at least one step is phased, so a fully-legacy flow looks identical.

### Assigning a phase

In the step builder, the **Knowledge phase** dropdown assigns (or clears, via *Unphased*) a step's
phase. It rides the existing save paths (canvas node config / file frontmatter) — no new storage.

## Default phases in the shipped systems

The shipped [systems](../how-to-contribute/systems-gallery.md) label their steps with a sensible
primary phase each:

| Starter flow | Default phase |
|---|---|
| Fleeting note | Capture |
| Literature note | Process |
| Permanent note | Develop |
| Structure map (MOC) | Connect |

## Actions and phases

Grouping **actions** by cognitive category (Manipulation / Relations / Knowledge / Research / AI) is
a separate concern — see #152. In #149, an action→phase mapping is guidance only, not code.

## Action selector — redesigned UI (#256)

When configuring a step you add actions via the **"+" button** at the bottom of the step builder.
The selector panel has three layered components:

### Category tabs

A horizontal strip of five tabs in canonical order — 📝 Manipulation, 🔗 Relations, 🧠 Knowledge,
🔍 Research, 🤖 AI — sits at the top of the panel. The default active tab is **Manipulation**.
Clicking a tab filters the chip grid to show only that category's actions. Arrow-key navigation
moves focus between tabs; Enter/Space activates.

Entering a search term disables tab filtering: all matching actions from every category are shown
in a flat list and the tab strip fades to indicate search mode. Clearing the field restores the
previously active tab.

### Compact action chips

Each action is displayed as a compact chip (icon + label, ≤ 80 px tall) arranged in a 4-column
grid on panels ≥ 500 px wide and a 2-column grid on narrower panels. Hovering a chip (or tapping
on mobile) reveals a tooltip with the action's full description and, when available, a link to
its documentation page. Clicking the chip adds the action to the step and closes the selector.

Template actions (installed from the community browser) are visually differentiated with a dashed
border.

### Smart suggest row (#256 FR-14–FR-17)

When the step already has one or more actions added, a **"Suggested for this step"** row appears
above the tab strip. It shows up to three complementary action chips derived from a static
affinity map (for example, adding a *Prompt* action surfaces *Create semantic relation*). The row
is absent when there are no existing actions or when the affinity map yields no new suggestions.

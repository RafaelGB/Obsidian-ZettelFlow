# This note

**This note** is the note you are reading, seen from the right sidebar: where it stands, what
surrounds it, and how it got here. It docks beside the editor and follows the active note, the way
Backlinks and Outline do, so the answer to *"what about this note?"* is always one glance away.

![This note, docked in the right sidebar and in two columns when the pane is wide](../resources/this-note/companion.svg)

## Opening it

- **Ribbon menu** — the ZettelFlow ribbon button › **This note**. It opens in the right sidebar.
- **Command palette** — **"Show this note in the sidebar"** (`open-note-companion`).
- **Every command that opened the old Timeline mode** still works and lands here:
  *Show evolution timeline*, *Show notes history*, *Show evidence map* and
  *Resurface related notes*. Their ids did not change, so existing hotkeys keep working.

There is only ever one. Opening it again reveals the one you have, wherever you put it. If you
drag it into the main area it stays there.

## Following, and pinning

The companion **follows the active note**. Open a canvas, an image or a PDF and it says it has no
note to show, offering the last note it showed.

**📌 Pin** keeps it on one note while you open others. Click the pin again, or **Follow the active
note** in the banner, to go back to following. A pin survives a restart; a renamed note keeps its
pin; deleting the pinned note unpins it.

**↻ Refresh** is the only refresh in the view. It also refreshes itself shortly after the vault
changes.

## The head

- **The title**, with the full path on hover. It stays in view while the rest scrolls.
- **The lifecycle stepper** — *fleeting → literature → permanent*, extended to *developing* and
  *evergreen* once a note has reached them. The current step carries the accent. A note that never
  stated a state reads *No state yet*, not *fleeting*. The stepper is read-only: moving a note on is
  a decision, and it has its own place.
- **Four counts** — links in, links out, claims, and distinct sources. They are facts, never a
  grade: there is no score, no band and no percentage, and a zero is drawn faint, never in a
  warning colour ([cognitive agency](cognitive-agency.md), constitution §XII). *Claims* and
  *sources* open the **Gaps** section, where the claims without a source are listed.

## What surrounds it

One list of sections, each with a title and a count, collapsible, in a fixed order:

| Section | What it lists | Computed by |
|---|---|---|
| **In tension** | notes that contradict it | the [evidence map](evidence-map.md) |
| **Supports** | notes that support it, and the sourced evidence (claim · source) | the evidence map |
| **Gaps** | its unsourced claims and open questions | the evidence map |
| **Near and forgotten** | nearby notes you have not revisited, with the reason | [connection resurfacing](connection-resurfacing.md) |

Sections with nothing in them are not drawn as empty boxes: they are said once, on one quiet line
(*No supports · nothing near and forgotten*). What you expand or collapse stays that way while the
view is open, across notes.

**Insert link** on a *Near and forgotten* row writes `[[that note]]` **into this note** — the
companion's note, even when it is pinned and you are editing another one — through the write record,
and answers inline: *Linked X. Undo* for thirty seconds. There is no toast.

These sections show whether or not snapshots are recorded: neither stores claim texts, so the
history's opt-in does not reach them.

## The history

Below the sections — or beside them, when the pane is wide — is the note's
[evolution timeline](evolution-timeline.md): snapshots, verdicts, moves, thoughts, returns,
promotions and the day you expect to know by. It reads the companion's note, so a pinned
companion shows the pinned note's history.

## Narrow and wide

The layout follows the width of its own pane, not the window. Docked at sidebar width it is one
column. From about 37.5rem of pane width — a wide sidebar, or the view dragged into the main area —
the history moves into a second column beside the sections.

## For contributors: opening it from code

`openNoteCompanion(app, { path?, focus?, move? })`
(`architecture/components/core/noteCompanion/openNoteCompanion.ts`) is the only opener. It reveals
the existing view or creates one with `ensureSideLeaf(…, "right")`.

| Field | Meaning |
|---|---|
| `path` | show this note (a pinned companion moves its pin to it) |
| `focus` | one-shot landing: `"nearby"` and `"gaps"` expand, scroll to and highlight that section (the quiet line when it is empty); `"next"` is reserved for the next-step card (#641) |
| `move` | the next move to preselect with `focus: "next"` |

`focus` and `move` are used once on arrival and never persisted; only `{ path, pinned }` of a pinned
companion survive a restart. The view is a host for **blocks** (`noteCompanion/blocks/`): head,
sections and history today, each rendering from one `CompanionModel` built per refresh from the
State-layer projections `noteVitals`, `lifecycleStepper` and `companionSections`.

## What moved here

This view replaces the **Timeline** mode of the Health surface (#640, epic #639). A workspace that
still holds a Health leaf on that mode opens Health on its first mode and This note in the right
sidebar. The *Contradicts* and *Not revisited* panels that the mode used to mount, each with its own
heading and refresh button, are now the sections above. The daily spark button went with them.

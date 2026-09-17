# What ZettelFlow wrote

ZettelFlow writes to your vault in a dozen places: a flow creates a note, a step declares a
satellite beside it, a property hook sets frontmatter on a note you were not looking at, giving a
canvas a role **moves** it, and installing a system from the gallery creates a handful of files.

Until 3.6 none of that was written down. The answer to *"what did that flow just do?"* was to open
the notes and look.

Now every write leaves a **fact**. This page is what that record is, what it deliberately is not,
and where it lives.

## The record

One entry per change, newest first:

| Field | What it holds |
|---|---|
| `kind` | `note-created` · `file-created` · `file-moved` · `properties-set` · `content-appended` · `content-replaced` |
| `path` | what was written |
| `from` | where a moved file came from |
| `origin` | who did it: a flow (and its step), a hook (and its property), an action, a gallery install, or you |
| `batch` | the id every write of **one action** shares |
| `before` / `after` | for a property change: the touched keys, as they were and as they were left |
| `at` | when |

### No note content, ever

There is no field for a note's body, and a test asserts there is not. (The one exception, stated
below, is the text of an **append** — ZettelFlow's own output, capped at 2,000 characters.) The record is deliberately
not a second copy of your vault — a copy would have none of your vault's protections and all of
its contents.

This is affordable because of how undo works: a note ZettelFlow created is taken back by moving it
to **Obsidian's trash**, which needs no copy of the body. A property change is taken back by
writing the previous value, which is exactly what `before` holds — and only for the keys that
actually changed.

The one thing that cannot be taken back is therefore `content-replaced`: overwriting an existing
file. It is still **recorded**, because *what ZettelFlow changed* is worth answering even where
*take it back* has no answer.

### A week, and a ceiling

The record is kept for **seven days at most**, and never more than **1,000 entries** — whichever
comes first. Time is the policy; the entry cap is the safety net for a vault whose hooks fire all
day. Neither is configurable: a write record carries the values it would restore, and the honest
way to keep that small is to keep it short.

It lives in the plugin's settings (`data.json`), like the
[script run log](scripting.md#every-run-leaves-a-fact-444).

### A batch is what one action did

A flow that creates a note, writes a satellite beside it and sets two properties has performed
**four writes and one action**. The batch id is what says so, and it is the reason undo can take
back the thing you actually did rather than one file of it.

```mermaid
flowchart LR
    NB[the flow] --> R[the recorder]
    SAT[its satellite] --> R
    PROPS[the properties it set] --> R
    R --> BATCH[(one batch)]
```

Batches nest: an action inside a flow belongs to the flow's batch, while the record still names the
action as the origin of that particular write — the outer batch is the unit you undo, the inner
origin is the accurate answer to *who wrote this file*.

## Where the record is taken

Not at the call sites. Two services are the only places ZettelFlow writes, and the record is taken
inside them:

- **`FileService`** — `createFile`, `createFileOnce`, `writeFile`, `writeBinaryFile`, `modify`
  and `moveFile`.
- **`FrontmatterService`** — every property write in the plugin passes through one private
  `processFrontMatter`, which is the only moment at which the *previous* value still exists. The
  record is taken there, as a **diff**.

Taking the diff rather than a copy has a consequence worth stating: a hook that sets a property to
the value it already had has **changed nothing**, so it leaves no record — and later, offers no
undo for a change it did not make.

A guardrail test (`test/architecture/plugin/vaultWriteCoverage.test.ts`) derives the writing
methods from the source and fails when one of them does not record. `deleteFile` is the single
named exception: undoing a deletion would mean keeping the body, and Obsidian's trash already holds
the file.

## Taking it back

The record is read by the **Recent** mode of the Home surface, which is now *What ZettelFlow
changed*: batches newest first, each one naming what ran, what it touched and when.

That mode used to list the notes the wizard built, from a second list kept only for it. It never
mentioned the satellite beside the note, the frontmatter a hook set while you were elsewhere, or
the canvas that moved when you gave it a role. The narrow list is gone; the complete one replaced
it, and the `history` setting is dropped on load.

### Undo takes a batch, not a file

`Ctrl+Z` reaches the note you have focused. This reaches what you actually did:

- Notes and files ZettelFlow **created** go to Obsidian's **trash**. Nothing is deleted.
- Properties it **set** go back to their previous values — and a key it *added* is removed again,
  because "before" recorded its absence.
- A file it **moved** goes back where it came from.
- Text it **appended** is removed, exactly that text and nothing around it.

### It is previewed, and it refuses

Before anything happens, a confirmation states the counts and names the notes. Cancelling changes
nothing.

And undo **refuses** rather than overwriting your work:

| Situation | What happens |
|---|---|
| You edited the note after ZettelFlow wrote it | Left alone, named, with when it changed |
| A property no longer holds what ZettelFlow left | Left alone, naming the key |
| The write was an overwrite (`content-replaced`) | Left alone: the old content was never kept |
| The file is already gone | Skipped quietly — there is nothing to take back |

When some of a batch is out of reach, the rest is still planned and offered as an explicit
*undo the rest* — a partial undo is a decision you take, never one taken for you.

A batch that has been taken back is marked as such, and is not offered again.

### The one place content is kept

An **append** is the exception to *no note content*: the record keeps the exact text ZettelFlow
added, up to 2,000 characters, because removing it again is the only way an append can be reversed.
It is ZettelFlow's own output, capped, and gone in a week. Past the cap the write is recorded as an
overwrite instead, and cannot be taken back.

### Undoing is not a write

The undo's own operations are performed with recording **off**. Putting a note back is not a new
thing ZettelFlow did to your vault, and recording it would leave you an undo you could undo.

## Recording never changes the write

The rule the [script run log](scripting.md) established holds here too: **observing must never
change what was observed**. `recordVaultWrite` cannot throw into a write path — every branch is
wrapped, and a recorder that fails logs a warning and gives up. A record that breaks a note is
worse than no record.

## Capability disclosure

| Capability | Used |
|---|---|
| File system — write | The record itself, capped, in the plugin's own settings — and, only on an explicit, previewed undo: moving created notes to the trash and restoring previous property values |
| Network | No |
| Clipboard | No |
| Script execution | No |
| AI | No |

Under [§XII](../development/constitution.md), a change record is a **mechanical** account of what
already happened: no severity, no ranking, no advice about whether a write was a good idea.

---
description: Read a path across your notes the way you read a book — right-click any note, no MOC needed, and nothing is written to your notes.
---

# The Reader

**Follow ideas, not files.** The Reader turns a handful of related notes into something you read
from start to finish, the way you read a book. It takes the whole window, gives you one chapter at a
time, and steps out of the way while you read.

![The Reader: a chapter of a reading path, with the bar and the type panel](../resources/reader/reader.svg)

## Open it

- **Right-click any note → Read from here.** That is the whole setup. You don't need a map of
  content or a list of relations: the note you right-click is where the reading starts.
- **This note → ⋯ → Read around this note**, from the note you are on.
- **Right-click several notes → Read these**, or **right-click a folder → Read this folder**.
- **Explore → Read these**, beside *Copy as links*, reads what your question selected.
- **Command palette → "Read from the active note"**, which you can bind to a hotkey.

The sidebars fold away and the Reader takes the window. When you leave, with **Esc** or the **×**,
your workspace comes back exactly as it was: the sidebars that were open open again, and you return
to the tab you were in.

## Choosing what to read

When there is more than one good way through a note, *Read from here* asks **how do you want to
read it?** Each way shows its shape, what it promises and the chapters it would read, so you choose
on what you will actually read.

![The chooser: the ways through a note, a reading to resume, and the chapters of the one picked](../resources/reader/paths.svg)

| Way | Reads | Offered when |
|---|---|---|
| **Around this note** | the note, its neighbours strongest link first (counterpoints, supports, examples, other typed relations, plain links), then the notes two steps away that most of them touch, then notes near it you never linked | always — it is the default |
| **Argument** | the thesis, what supports it, what argues back, then the notes that speak to both sides | the note has typed `supports` / `contradicts` relations |
| **Story of an idea** | the same notes as *Around*, in the order you first worked on them (decisions, moves, creation date) | at least three chapters, on at least two different dates |
| **Essentials** | only the hubs around the note: the notes linked three times or more, most linked first, at most seven | it leaves something out |
| **Region** | the note's region of your graph: notes that link to each other more than to the rest, its hub first | the region has three notes or more, not all already its neighbours |

Every way reads at most twelve chapters, and only notes your vault actually has. A way that would
read exactly the same chapters as one already offered is not offered twice. When only one way
applies and there is nothing to resume, the chooser is skipped and the reading starts.

**Read these** and **Read this folder** read the notes you picked (up to sixty) in the order their
links suggest: each next chapter is the note most linked to the ones already read.

### Resume

Leave a reading part-way and the Reader remembers the chapter. Next time, the chooser offers
**Resume at chapter n**; a picked set or a folder reopens where you left that same set. Reaching the
last chapter, or going back to the first, forgets the place. The Reader keeps the forty most recent
places, in the plugin's settings — a picked set is kept as a fingerprint, not a list of your notes.

## Chapters and roles

Every reading starts with the note you started from (a picked set starts with its first note). A
note joined both ways comes before one joined one way, and a typed relation before a plain link. No
unresolved links, attachments or self-links are read.

Each chapter carries its **role** relative to the note you started from, read off your typed
relations:

| Role | When |
|---|---|
| **Thesis** | the note you started from, when something supports it or argues with it |
| **Support** | a note joined to it by `supports` |
| **Counterpoint** | a note joined to it by `contradicts` |
| **Synthesis** | in an *Argument*, a note that speaks to both sides |
| **Context** | anything else |

## Reading

| Key | Does |
|---|---|
| **→**, **Space**, **Page down** | next chapter |
| **←**, **Page up** | previous chapter |
| **Home** / **End** | first / last chapter |
| **F** | fullscreen (desktop) |
| **Esc** | close a panel, leave fullscreen, or leave the Reader |

The **bar** at the bottom appears when you move the mouse and fades after two seconds. It holds:

- the chapter you are on and your progress;
- **Contents**, the chapters with their roles;
- **Type**;
- **Around this chapter**, with what supports it, what argues back and its open questions;
- **Fullscreen**.

Chapters are drawn by Obsidian's own Markdown renderer, so callouts, embeds, math and your theme look
as they do everywhere else. A link to another chapter of the reading turns the page to it. Any other
link opens in a tab beside the Reader.

## Type and reading themes

The **Type** panel sets the font (your theme's own, or a serif), three sizes and a reading theme. The
choices are kept for next time.

| Theme | Looks like |
|---|---|
| **Your theme** | the reader uses whatever Obsidian looks like now |
| **Light** / **Dark** | your theme's own light or dark palette, for the reading column only |
| **Sepia** | the light palette warmed with your theme's yellow |

No colour is invented: every look comes from your theme.

## What it writes

**Nothing, to any note.** Reading is the whole job, and a test holds the line: nothing in the Reader
reaches a file writer. The only things it remembers are where you are in a reading (in the workspace
layout, and the resume places in the plugin's settings) and your type choices (in the plugin's
settings). Choosing a way through a note writes nothing either.

## For contributors

- The view is `ReaderView` (`zettelflow-reader`), a standalone `ItemView` like *This note*, and
  `openReader(app, seed)` is its only opener.
- The opener snapshots the sidebars, folds them and opens one reader leaf. `restoreWorkspace` gives
  them back, once.
- The snapshot also lives in the view state, so a reader left open across a restart still restores.
- The ways come from pure generators in the State layer (`readingPath.ts`): `aroundThisNote`,
  `argumentPath`, `storyPath`, `essentialsPath`, `regionPath` and `selectionPath`, offered together
  by `readingPathOptions(model, seed, inputs)`. They are on `zf.knowledge.readingPaths` and
  `zf.knowledge.readSelection`; `readFromHere` stays.
- What the model does not hold — the near-but-unlinked notes (the resurface ranking) and when each
  note was first worked on (decisions and moves) — is read once, in `readerPaths.ts`, and handed in.
- The chooser is `ReadingPathModal`; `readFrom` and `readSelection` are the doors' shared entry
  points. The view state carries `kind` and, for a picked set, its `paths`.

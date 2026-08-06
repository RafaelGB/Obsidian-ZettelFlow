# Atomicity split assist

The **atomicity split assist** breaks a long note into one **atomic note per top-level section**,
turning the source note into an index (hub) that links to each piece. It is exposed as a single
command and never writes anything until you confirm.

## The command

Open the command palette and run **"Split note into atomic notes"** while a markdown note is
active. The command is available on desktop and mobile and ships without a default hotkey.

- If no markdown note is active, a notice asks you to open one first.
- If the active note has **fewer than two top-level (`#`) sections**, there is nothing to split and
  a notice explains why — the preview modal is not shown and nothing is written.

## How a note is segmented

The note body is parsed into three parts:

- the **frontmatter** block (`--- … ---`), preserved verbatim;
- a **preamble** — everything before the first top-level heading — preserved verbatim;
- one **section** per top-level heading.

A top-level heading is a line that starts with exactly one `#` followed by a space and content
(`# My topic`). Sub-headings (`##`, `###`, …) belong to the section they sit under and never start
a new one.

## Preview and confirm

The modal lists every section with its **proposed atomic-note title** (derived from the heading,
with characters that are illegal in note names removed) and an **include toggle** that defaults to
on. Turn a toggle off to leave that section in the source note untouched.

**Split selected sections** performs the split. If no section is selected, a notice asks you to
pick at least one and nothing is written.

## What the split writes

For each selected section:

- a new **atomic note** is created in the **same folder** as the source, containing the section
  content (verbatim, including its heading) followed by a **backlink** to the source note
  (`Split from [[Source]]`);
- the corresponding section in the source note is replaced by a single `[[wikilink]]` to the new
  note, so the source becomes an index/hub.

Excluded sections, the preamble and the frontmatter are left **byte-for-byte** unchanged.

### Collision-safe naming

Target names are made unique before anything is written: if a note with the proposed title already
exists in the folder, or the same title is used twice within one split, a numeric suffix (` 2`,
` 3`, …) is appended until the name is free.

## Atomicity guarantee

All atomic notes are created first. **If any creation fails**, the notes already created in that
batch are rolled back (best-effort) and the **source note is left intact** — the same holds if the
final rewrite of the source fails. On success, a single rewrite of the source note is performed and
a notice reports how many atomic notes were created.

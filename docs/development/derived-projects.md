# Derived projects

Knowledge stays trapped as notes; turning it into output is fully manual. **Derived projects** turns
a folder of notes into the **structure** of a book, course, article, talk or newsletter — an ordered
outline that **links every source note**. It does not write prose for you; it **organizes** what you
already know, from the semantic graph.

## Using it

Open any note in the folder you want to outline, then run **"Derive project outline"** from the
command palette. ZettelFlow reads that note's **folder**, clusters its notes from the graph, and
writes a structure note to `_ZettelFlow/projects/<folder> outline.md`, opening it. Offline, no AI.

*(Selecting an arbitrary set of ~40 notes via a picker is a planned follow-up; v1 uses the active
note's folder.)*

## How the outline is built

Restricted to the folder's indexed notes:

- **Sections** are clusters, the [knowledge-map](living-knowledge-map.md) way (#164): an **anchor**
  is a selected note whose *in-selection* degree (neighbours that are also in the selection) is ≥ 2;
  each anchor heads its own section.
- **Members** — every non-anchor note joins its **strongest-adjacent anchor** (a bidirectional link
  beats a one-way one; ties by the anchor's in-selection degree, then path). A note with no adjacent
  anchor lands in a final **Other notes** section — nothing is dropped.
- **Order** — within a section the anchor leads, then members by in-selection degree (most connected
  first) then path; sections are ordered by anchor degree, "Other notes" last.
- Every indexed selected note appears **exactly once**; a note in the selection that isn't indexed is
  ignored. The whole thing is pure, deterministic and never throws.

## The exported note

A Map of Content: an H1 title (`<folder> — project outline`), a `##` heading per section, and a
`- [[note]]` wikilink per source note. It's a normal note — edit, reorder and flesh it out into your
draft.

## Out of scope (deferred)

- **AI polish** — an optional pass to refine section titles / ordering is a follow-up. The shipped
  command is fully offline and AI-free (that's AC-2).
- **Project type** — book / course / article / talk / newsletter is a label only for v1 (the title);
  per-type structure is a follow-up.

## Architecture

```
deriveOutline(model, selectedPaths, { hubThreshold, miscTitle })   (pure, Obsidian-free, unit-tested)
  → { sections: [{ title, notes }] }        selection-restricted clustering, every note linked once

renderOutlineMarkdown(outline, { title })                          (pure, Obsidian-free, unit-tested)
  → the MOC markdown (# title · ## section · - [[note]])

DeriveProjectComponent (derive-project command, no hotkey)
  active file → parent folder → FileService.getTfilesFromFolder → deriveOutline → renderOutlineMarkdown
  → FileService.writeFile("_ZettelFlow/projects/<folder> outline.md", …, openAfter)
```

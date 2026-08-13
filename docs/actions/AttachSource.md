# Attach source action

🔍 A **Research** action (#155). Attaches a **source** — a `[[wikilink]]` to a note or free text
(URL / DOI / citation) — to the **note being built**, written under the `source` frontmatter key so
the [knowledge model](../architecture/knowledge-model.md) (#148) indexes it and the note's
`hasSources` signal flips on re-index. Deterministic and offline.

## Options

- **Source** — the wikilink or free text to attach. An empty value is a **safe no-op** (nothing is
  written).
- **Write to** — `Frontmatter` (recommended — indexed promptly) or `Context`.

## Result

A `source: <value>` field on the note being built (also exposed as `{{source}}`), plus a `Notice`.
After re-index the model derives a claim carrying the source and reports the note as sourced.

Writing to an **existing foreign note** is out of scope for this action (it only writes the note
being built).

## Interactive-only (#231 Phase 4)

This action reads a **fixed `source`** from its own configuration, so it is meant for **interactive**
use (you set the source while building the note). It is a **no-op when authored into a shipped
`.zftemplate` system's `onCreation`** — a template can't know the per-note source, so an empty value
writes nothing. In a system, capture the source with a normal **prompt** (or use the deterministic
[`find-sources`](FindSources.md) to suggest candidates). See the
[Systems Gallery authoring guide](../how-to-contribute/systems-gallery.md).

## Capabilities

File-system write of a single `source` frontmatter field on the note being built (the same surface
as every action). **No network, no AI.**

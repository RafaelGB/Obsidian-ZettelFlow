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

## Capabilities

File-system write of a single `source` frontmatter field on the note being built (the same surface
as every action). **No network, no AI.**

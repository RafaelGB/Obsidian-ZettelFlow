# Find related action

🔗 A **Relations** action (#154). Ranks the notes most worth linking to the target by **shared graph
context** — reading only the [knowledge model](../architecture/knowledge-model.md) (#145). No text
or AI inference: relatedness is purely structural. Deterministic and offline.

## How the ranking works

For each candidate note the score combines two graph signals:

- **Co-citation** (weight 2) — how many notes link to **both** the source and the candidate
  (`|inN(source) ∩ inN(candidate)|`).
- **Bibliographic coupling** (weight 1) — how many notes the source and candidate **both** link to
  (`|outN(source) ∩ outN(candidate)|`).

`score = 2·co-citation + 1·coupling`. The source itself, notes already directly connected to it
(a link in either direction), and candidates with no shared context (score 0) are excluded. Results
are ordered by score descending, ties broken by path ascending, and capped to **Max results**.

## Options

- **Result property** — where the ranked list of `[[wikilinks]]` is written (default `related`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Source note (optional)** — the note to rank against; empty ⇒ the note being built.
- **Max results** — how many suggestions to keep (default 10).

## Result

An array of `[[link]]`s to the most related notes, plus a `Notice` reporting the count. An empty
list is a valid result — in particular, the **note being built is not yet indexed**, so ranking it
before it exists yields nothing; point **Source note** at an existing note to get suggestions. If
the index isn't ready, the action safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

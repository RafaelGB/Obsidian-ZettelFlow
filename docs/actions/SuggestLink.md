# Suggest link action

🔗 A **Relations** action (#154). Surfaces the **top link suggestions** for a note from shared graph
context, using the same structural ranking as [Find related](FindRelated.md) with a tighter default
cap — framed as *links you might want to add*. Reads only the
[knowledge model](../architecture/knowledge-model.md) (#145). Deterministic and offline.

## Options

- **Result property** — where the suggested `[[wikilinks]]` are written (default `suggestedLinks`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Source note (optional)** — the note to rank against; empty ⇒ the note being built.
- **Max results** — how many suggestions to keep (default 5).

## Result

A short array of `[[link]]`s to the strongest suggestions (co-citation weighted above bibliographic
coupling; already-linked and zero-context notes excluded), plus a `Notice` reporting the count. As
with Find related, the freshly-built note is not yet indexed — point **Source note** at an existing
note to get suggestions. If the index isn't ready, the action safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

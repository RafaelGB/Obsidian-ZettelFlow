# Find contradiction action

🧠 A **Knowledge** action (#153). Lists the notes that **contradict** the target — the deduped union
of its outgoing and incoming [`contradicts` semantic relations](../architecture/knowledge-model.md)
(#147). **Relation-only, no text or AI inference.** Deterministic and offline.

## Options

- **Result property** — where the list of `[[wikilinks]]` is written (default `contradictions`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Target note (optional)** — the note to analyze; empty ⇒ the note being built.

## Result

An array of `[[link]]`s to the contradicting notes, plus a `Notice` reporting the count. An empty
list is a valid (and common) result. If the index isn't ready or the note isn't indexed, the action
safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

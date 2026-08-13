# Find unanswered question action

🧠 A **Knowledge** action (#153). Lists the **open questions** a note raises that nothing answers
yet — its outgoing [`question` relations](../architecture/knowledge-model.md) (#147) whose
destination has **no incoming `supports`** edge. Relation-only, deterministic, offline.

## Options

- **Result property** — where the list of `[[wikilinks]]` is written (default `unanswered-questions`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Target note (optional)** — the note to analyze; empty ⇒ the note being built.

## Result

An array of `[[link]]`s to the unanswered questions, plus a `Notice` with the count. As soon as a
`supports` edge points into a question, it drops off the list. If the index isn't ready or the note
isn't indexed, the action safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

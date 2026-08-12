# Find sources action

🔍 A **Research** action (#155). For an **under-sourced** note, suggests candidate **sources already
present in the vault** — drawn from the note's graph neighbours' sources and the vault's
most-referenced sources ([`sourcesByReferenceCount`](../architecture/knowledge-model.md), #145).
**Vault-local and offline — not a web search** (external/AI source discovery is the 🤖 AI category).

## Options

- **Result property** — where the candidate sources are written (default `candidateSources`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Source note (optional)** — the note to suggest sources for; empty ⇒ the note being built.
- **Max results** — how many candidates to keep (default 5).

## Result

A ranked list of candidate sources (link sources as extensionless `[[wikilinks]]`, free text
verbatim): sources cited by the note's **graph neighbours** come first (topically relevant), then by
how widely each is already cited in the vault — plus a `Notice` with the count. **The note must be
unsourced** — an already-sourced / unknown target, or an empty model, yields an empty result. If the
index isn't ready, the action safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

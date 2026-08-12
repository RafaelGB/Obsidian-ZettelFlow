# Extract claims action

🔍 A **Research** action (#155). Surfaces the **claims** (and their sources) a note declares, read
from the [knowledge model](../architecture/knowledge-model.md)'s `ClaimSourceSchema` parse (#148).
Read-only, deterministic, offline.

## Options

- **Result property** — where the extracted claims are written (default `claims`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Source note (optional)** — the note to read; empty ⇒ the note being built.

## Result

A `{ claim: [...], source: [...] }` object — the claim texts and the note-level sources (a link
source as an extensionless `[[wikilink]]`, free text verbatim), plus a `Notice` with the claim
count. The shape round-trips: feeding it back through `ClaimSourceSchema` reproduces the same
claims. A claim-less note yields an empty result. If the index isn't ready, the action safely
no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

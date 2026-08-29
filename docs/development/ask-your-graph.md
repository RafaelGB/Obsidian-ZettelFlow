# Ask your graph

**Ask your graph** (#318 S3) queries your notes by **meaning and structure** — typed relations,
connectivity, sources, orphanhood, age, lifecycle state — not by frontmatter or tags. That is the line
the manifesto draws: *"show me every idea that contradicts this"* is a question about the **shape of your
thinking**, and it is exactly what a Dataview query cannot answer. It is **deterministic** — a query is a
set of predicates, never a natural-language prompt, and AI is never involved.

Open it with the **Ask your graph** command (or the ribbon → *Ask your graph*).

## The query language

A query is predicate **terms** combined with `AND` / `OR`. `AND` binds tighter than `OR`, so
`a AND b OR c` means `(a AND b) OR c` (disjunctive normal form). A term can be negated with a leading `!`.
A blank query matches nothing — the surface asks for intent.

| Term | Selects |
|---|---|
| `state:<value>` | notes in a lifecycle state, e.g. `state:permanent` |
| `relation:<type>` | notes with an outgoing typed edge, e.g. `relation:contradicts` |
| `relation:<type>:<target>` | …pointing at a note whose name/path contains `<target>`, e.g. `relation:supports:decisionA` |
| `degree>=<n>` | connectivity — also `<=`, `>`, `<`, `=` (e.g. `degree>=5`) |
| `hub` | a well-connected note (degree ≥ 5) |
| `orphan` | nothing links to it (no incoming edges) |
| `leaf` | it links to nothing (no outgoing edges) |
| `unsourced` | it makes a claim but cites no source |
| `older-than:<days>` / `newer-than:<days>` | by creation age |
| `about:<term>` | its title or path contains the term |
| `!<term>` | negate any term, e.g. `!orphan` |

## Examples

```text
state:permanent AND unsourced                       # permanent notes with no sources
state:permanent AND orphan AND older-than:30         # orphaned permanents older than 30 days
hub AND relation:contradicts                         # well-connected notes that contradict something
relation:supports AND relation:contradicts           # notes that both support and contradict a note
state:fleeting OR unsourced                          # fleeting or still-unsourced ideas
```

Results are sorted by connectivity (degree, highest first) then path, and every result opens on click.
A useful query can be **saved** (persisted in settings) and re-run from the *Saved queries* list.

## Architecture

```
runGraphQuery(model, source, now)                    (pure, Obsidian-free, unit-tested)
  → { matches: Idea[], error? }                       DNF of predicate terms; deterministic sort
  parses: state / relation[:target] / degree cmp / hub / orphan / leaf / unsourced / older-/newer-than / about / !neg

AskGraphModal (command: ask-your-graph)
  reads the KnowledgeIndex model → runGraphQuery(query)
  examples + predicate help + saved queries (settings.savedGraphQueries)
```

The engine lives in `src/architecture/knowledge/query/graphQuery.ts` and is re-exported from the Knowledge
State barrel. It reads only the `KnowledgeModel` — offline, read-only, and it never mutates the vault.

## Scope

This ships the deterministic query engine and a run-and-save surface. A dedicated **Ask-your-graph mode**
(a persistent surface tab, result lenses including [reasoning paths](concept-navigation.md#reasoning-paths),
richer saved-query management, `concept:` predicates) is tracked as a follow-up epic (#323). Embeddings / RAG /
vector search are intentionally out of scope (the manifesto: a query stays deterministic and offline).

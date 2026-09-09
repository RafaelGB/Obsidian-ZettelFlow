# Ask your graph

**Ask your graph** (#318 S3) queries your notes by **meaning and structure** — typed relations,
connectivity, sources, orphanhood, age, lifecycle state — not by frontmatter or tags. That is the line
the manifesto draws: *"show me every idea that contradicts this"* is a question about the **shape of your
thinking**, and it is exactly what a Dataview query cannot answer. It is **deterministic** — a query is a
set of predicates, never a natural-language prompt, and AI is never involved.

Open it with the **Ask your graph** command (or the ribbon menu). It opens as a **persistent tab** in
the Discovery surface — the *Ask your graph* mode — so a query and its results stay open beside the note
you're editing and **recompute live** as the vault changes.

## The query language

A query is predicate **terms** combined with `AND` / `OR`. `AND` binds tighter than `OR`, so
`a AND b OR c` means `(a AND b) OR c` (disjunctive normal form). A term can be negated with a leading `!`.
A blank query matches nothing — the surface asks for intent.

| Term | Selects |
|---|---|
| `state:<value>` | notes in a lifecycle state, e.g. `state:permanent` |
| `relation:<type>` | notes with an outgoing typed edge, e.g. `relation:contradicts` |
| `relation:<type>:<target>` | …pointing at a note whose name/path contains `<target>`, e.g. `relation:supports:decisionA` |
| `incoming:<type>[:<source>]` | notes with an **incoming** typed edge — the mirror of `relation:`, e.g. `incoming:contradicts` (notes *something contradicts*) |
| `folder:<path>` | notes under a folder, e.g. `folder:Projects` (folder-boundary match, case- and Unicode-tolerant) |
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
  parses: state / relation[:target] / incoming[:source] / folder / degree cmp / hub / orphan / leaf / unsourced / older-/newer-than / about / !neg

AskGraphRenderer — the "Ask your graph" mode of the Discovery surface (command: ask-your-graph)
  reads the KnowledgeIndex model → runGraphQuery(query); recomputes live on vault change
  list / table lenses · guided term builder (buildGraphTerm) · examples · predicate help
  saved queries (settings.savedGraphQueries: named / reorderable / pinned)

buildGraphTerm(selection) + savedQueries ops    (pure, Obsidian-free, unit-tested)
  {field, comparison?, value?, negate?} → a valid term  ·  add/rename/move/pin/normalize
```

The engine lives in `src/architecture/knowledge/query/graphQuery.ts` and is re-exported from the Knowledge
State barrel. It reads only the `KnowledgeModel` — offline, read-only, and it never mutates the vault.

## Scope

This ships the deterministic engine, the extended predicate set (incl. `incoming:` and `folder:`, #323 G1)
a **first-class Discovery surface mode** (a persistent tab that recomputes live, #323 G2), **result
lenses** — a plain list or a **table** (note · state · degree · sources), #323 G3 — **richer saved
queries** (#323 G4): each saved query can be **named**, **reordered**, and **pinned to Home**, where it
becomes a live *"N notes match …"* card that deep-links back into the query, pre-filled — and a **guided
term builder** (#323 G5) that composes a valid term from field / comparison / value pickers, so a
non-writer never has to memorise the grammar. Still tracked under #323: a
[reasoning-paths](concept-navigation.md#reasoning-paths) lens. Embeddings / RAG / vector search are
intentionally out of scope (the manifesto: a query stays deterministic and offline).

### Guided term builder

Don't want to memorise the grammar? The **Build a term** row composes one for you: pick a **field**
(`state`, `relation`, `degree`, `hub`, …), an optional **comparison** (for `degree`) and **value**,
tick **negate** to prepend `!`, and **Add term** appends a valid predicate to the query with `AND`.
A value-less field hides the value box; `degree` reveals the comparison box; an invalid selection
shows the reason in the status line instead of writing a broken term. The composer is the pure,
unit-tested `buildGraphTerm` (`graphTermBuilder.ts`) — it mirrors the [#235 condition
builder](../architecture/trigger-conditions.md) and only ever emits terms the engine parses.

### Saved queries

A useful query is **saved** from the query bar and re-run from the *Saved queries* list. Each saved
query carries an optional **name** (rename inline), an **order** (move up / down), and a **pin** state.
A pinned query surfaces on **Home** as a live count — mechanical output, no judgement written
([constitution §XII](constitution.md)) — and clicking it reopens *Ask your graph* on that query. The
list persists in `settings.savedGraphQueries` as `SavedGraphQuery` objects (`{ query, name?, pinned? }`);
an install predating the enrichment stored bare strings, which migrate transparently on read
(`normalizeSavedQueries`).

# Ask your graph

**Ask your graph** queries your notes by **meaning and structure** — typed relations, connectivity,
sources, orphanhood, age, lifecycle state — not by frontmatter or tags. That is the line the
manifesto draws: *"show me every idea that contradicts this"* is a question about the **shape of your
thinking**, and it is exactly what a Dataview query cannot answer. It is **deterministic** — a query
is a set of predicates, never a natural-language prompt, and AI is never involved.

Open it with the **Ask your graph** command (or the ribbon menu). It is its own **surface** — a
persistent tab you can move, split or pin wherever you like — so a selection and its results stay
open beside the note you are editing and **recompute live** as the vault changes.

It was the fifth mode of Discovery until someone used it (#487). Discovery's other modes are narrow
lists that belong in a side panel; Explore is a workspace, and a mode cannot be moved out of a pane
without taking the lists with it.

Inside it, only the **results** scroll. The facets, the chips, the lens bar and the answer line
stay put, because the part of a surface that is a control panel should not behave like content.

## Clicking is the query (#483)

Until 4.2 this mode opened on an empty box. You had to compose a specification in a small boolean
language before it would show you anything at all — and the "guided builder" that was supposed to
help was two dropdowns, a value field, a checkbox and an **Add** button whose entire effect was to
**paste DSL text into the box**. A form that emits code.

[Constitution §XIII](constitution.md) is explicit about that shape: configuration syntax is *an export
format and an escape hatch, never the front door*. So the order is inverted.

**Your whole vault is the starting selection**, and everything you could narrow it by is offered to
you, derived from your own notes, with counts:

| | |
|---|---|
| **state** | the lifecycle states *you* use — three if you use three |
| **links out to** / **linked from** | the typed relation types present, in both directions |
| **folder** | your top-level folders |
| **shape** | well connected · nothing links to it · links to nothing · claims without a source |

Clicking a value narrows the selection; the facets re-derive against what is left. Each choice
becomes a **chip** you can remove, or flip to its opposite with **¬** — negation stays reachable
without typing anything.

### Clicking can never empty your results

The counts are conditional on the **current selection**, and a value is offered only when
`0 < count < selection.length`. Nothing that matches nothing; nothing that matches everything.
Neither can narrow, and a filter that cannot narrow is noise.

Two things follow. Once a selection is entirely `permanent`, the state group **disappears** instead
of offering you the thing you already did. And every offered term finds something — so an empty
answer is no longer somewhere the interface can walk you into. See
[facets](../architecture/knowledge-state.md#facets-what-your-vault-lets-you-ask-482) for the derivation
and its cost.

### The text is what that produces

The query text lives under **As text**: generated from your chips, editable, runnable, and still
exactly what a saved query stores. It is the escape hatch, and it completes as you type — from the
grammar below and from your vault's own values, and from no third list.

The one thing the text can express that chips cannot is `OR`. A hand-written disjunction is shown as
written and **says so**, and the facets stand down rather than appending a term that would silently
re-bracket the query.

## The answer speaks (#485)

**Each row carries the facts your selection asked about.** Filter by sources and the row says what
it cites; filter by `relation:supports` and it says how many. With nothing selected it reads
`state · links`, exactly as it always did — nobody who never clicks a facet sees a change.

**A zero names the term that caused it.** `state:permanent AND unsourced AND folder:Reading`
matching nothing used to be a wall. Now the surface narrows one term at a time and says which one
reached zero, with the count immediately before it:

> Nothing matches. `folder:Reading` took it from 43 to none.

That is a **fact about your selection** and it stops there. Naming the term is mechanical;
proposing the fix would be a verdict, and [§XII](constitution.md) puts verdicts behind an explicit
human decision — of which there is none to take here, because the query is on screen and editable.
A guardrail scans these strings for advice verbs in both locales, because a doc paragraph will not
stop the next person adding a helpful sentence.

It refuses rather than guesses: a query containing `OR` has no single culprit, and a query with a
typo is broken rather than empty. Both get the plain message.

## A selection is a place to start (#486)

A selection is the most concentrated piece of intent the plugin holds — you built it click by
click — and until 4.2 it evaporated when you closed the tab. Only the *question* survived, as a
saved query, never the thing the question found.

Two moves, under the answer:

- **Copy as links** — the matches as wikilinks, in your clipboard, for the note you are already
  writing. Only on the click, never otherwise.
- **Make a map of content** — the matches become a real note, written by the **same builder**
  `build-map-of-content` has always used (#505): the links go into a machine-managed region, so
  running the map again updates that block and leaves every word you wrote around it untouched.
  It is **previewed first** (name, folder, how many will be listed) and it goes through
  `FileService`, so it appears in [Recent](../architecture/reversibility.md) and **undo takes it
  back**. A map of everything is not a map, so the action only appears once you have narrowed
  something.

  It did not always work that way. 4.3 shipped a second writer here that made a fresh numbered
  note and could not be re-run, because re-running had been declared out of scope **without
  checking that a re-runnable map already existed**. Maps written by that version have no managed
  region, so running them again appends one rather than updating it.

Both are **mechanical output** under [§XII](constitution.md): a gathered list, derived facts.
Neither concludes anything, so neither needs the accept/reject gate interpretive output does — and
a guardrail fails the build if the map ever grows a field a conclusion could live in.

### Why there is no third button

The obvious third destination is *Think about this selection*, and it is deliberately absent.
Thinking is about **something in particular**, and a set of forty notes is not something in
particular. The per-note move already exists (*Think about this note*), and the map this creates is
itself a note — so the moment a selection becomes a thing you can think about, the command that
does it is already there. A third button would have been a worse version of a door that is open.

There is no new export either: the graph lens already exports an image or a WebM clip, with its own
confirmation. Two answers to one question is the disease this epic exists to treat.

## The query language

You do not have to write this. It is here because you can, and because it is what a saved query
stores.

A query is predicate **terms** combined with `AND` / `OR`. `AND` binds tighter than `OR`, so
`a AND b OR c` means `(a AND b) OR c` (disjunctive normal form). A term can be negated with a leading
`!`. A blank query matches nothing in the engine; on the surface, no filters means **every note**.

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

```text
state:permanent AND unsourced                        # permanent notes with no sources
state:permanent AND orphan AND older-than:30         # orphaned permanents older than 30 days
hub AND relation:contradicts                         # well-connected notes that contradict something
state:fleeting OR unsourced                          # fleeting or still-unsourced ideas
```

Results are sorted by connectivity (degree, highest first) then path, and every result opens on
click.

## Architecture

```
runGraphQuery(model, source, now)                    (pure, Obsidian-free, unit-tested)
  → { matches: Idea[], error? }                       DNF of predicate terms; deterministic sort

deriveFacets(model, selection) → Facet[]             (pure) what can still narrow, with counts
selection.ts: toQuery / asSelection / toggleTerm /   (pure) the chips, and the text they produce
              invertTerm / matchesFor                       no filters ⇒ every note

AskGraphRenderer — the mode of the Discovery surface (command: ask-your-graph)
  facets → chips → results, recomputed live; the DSL under "as text", with completion
  saved queries (settings.savedGraphQueries: named / pinned)
```

The engine lives in `src/architecture/knowledge/query/graphQuery.ts`, the facets and the selection
beside it, and all three are re-exported from the Knowledge State barrel. They read only the
`KnowledgeModel` — offline, read-only, and they never mutate the vault. `zf.knowledge.query` and
`zf.knowledge.facets` expose the two of them a script can usefully ask.

## What this deliberately does not have

- **A term builder.** A form whose output is syntax does not satisfy §XIII; it conceals the failure.
  The facets replaced it, and they carry your real counts.
- **A grammar reference card on the surface.** It is on this page, where a reference for a language
  you no longer have to write belongs.
- **A table lens.** It showed the same matches as the list with four fixed columns — state, degree,
  sources — a universal schema instead of your question. Its one real advantage was alignment, and
  alignment is CSS. A lens has to be a genuinely different way of *seeing*.
- **Reordering saved queries.** Two buttons per row to move a list nobody sorts.
- **Embeddings, RAG or vector search.** The manifesto: a query stays deterministic and offline.

## Saved queries

A useful selection is **saved** from the chips row and re-run from the *Saved queries* list. Each
saved query carries an optional **name** (rename inline) and a **pin** state. A pinned query surfaces
on **Home** as a live count — mechanical output, no judgement written
([constitution §XII](constitution.md)) — and clicking it reopens the mode on that query, pre-filled.
The list persists in `settings.savedGraphQueries` as `SavedGraphQuery` objects
(`{ query, name?, pinned? }`); an install predating the enrichment stored bare strings, which migrate
transparently on read (`normalizeSavedQueries`).

# Performance budgets

Before 3.6 there was **one** `performance.now()` in the whole plugin and **no** budget, benchmark
or timing anywhere in the tests. Every statement about ZettelFlow's speed — including the ones in
the epic that created this page — was an opinion.

You cannot fix what you cannot measure, and you cannot keep it fixed without a gate. So there is
one instrument, a synthetic vault big enough to matter, and a set of budgets that **fail the
build**.

## The three pieces

| Piece | Where | What it is |
|---|---|---|
| The instrument | `src/architecture/monitoring/measure.ts` | `measure(name, fn)` / `measureAsync`, a bounded ring of samples, no I/O |
| The vault | `test/perf/generateVault.ts` | deterministic `IdeaSnapshot`s at any size, seeded, no `Math.random`, no clock |
| The budgets | `test/perf/budgets.ts` | every ceiling, with its reason and the number it was measured at |

The app and the budget suite use the **same** instrument, so the timings shown in Health are
literally the ones CI asserts.

## Running them

```bash
npm run test:perf     # the budget suite, --runInBand, --expose-gc
npm run verify        # unchanged, and still fast — the budgets are NOT in it
```

They are a separate CI job (`performance`) for one reason: they build vaults of fifty thousand
notes, and a slow loop is a loop people stop running.

`--runInBand` is not optional. Parallel jest workers compete for the same cores, which turns every
timing into a measurement of the other workers.

## What a budget is

A **ceiling with a reason**, never a record of the fastest run anyone has seen:

```ts
"analysis.discovery.10k": {
    name: "find discoveries over 10,000 notes",
    limit: 5_000,
    measured: "1,528 ms",
    because: "a hundred times every other projection and re-run on every render …",
},
```

Every budget must be able to answer *why that number*. They sit roughly 3–5× above the measured
baseline, because the gate exists to catch a change in **shape** — an accidental O(n²), a cache
that stopped caching — not a three-percent drift on a noisy runner. A budget sitting on its own
measurement turns every build red and teaches the team to ignore the gate.

Exceeding one prints the overshoot and the reason:

```
analysis.discovery.10k — find discoveries over 10,000 notes: 9000.000 / 5000 (OVER by 80%)
```

### One budget is a ratio, not a time

`analysis.discovery.scaling` asserts how the cost grows when the vault **doubles** (20k ÷ 10k).
Pairwise work that slipped to quadratic would still pass the 10k ceiling and be unusable at 50k.
The shape is the thing worth guarding.

## The baseline, and the surprise in it

Measured 2026-09-18 on the reference machine (Node 22):

| Budget | Measured | Ceiling |
|---|---|---|
| `index.build.1k` | 2.8 ms | 30 |
| `index.build.10k` | 21.8 ms | 150 |
| `index.build.10k.scoped` | 26 ms | 150 |
| `scope.evaluate.50k` | 67 ms (126 on CI) | 300 |
| `scope.census.50k` | 220 ms (364 on CI) | 900 |
| `scope.draft.50k` | 22 ms (49 on CI) | 150 |
| `index.build.50k` | **103 ms** | 600 |
| `index.startup.10k` | 26 ms (3.5–4.4 s before #795) | 300 |
| `derive.one` | 0.003 ms | 0.05 |
| `enrich.parse.50k` | 37.8 ms | 250 |
| `analysis.map.10k` | 13.9 ms | 120 |
| `analysis.communities.10k` | 157.3 ms | 400 |
| `analysis.debt.10k` | 5.1 ms | 60 |
| `analysis.tend.10k` | 12.7 ms | 100 |
| `analysis.gaps.tally.10k` | 1,310 ms | 5,000 |
| `analysis.gaps.seams.10k` | 1,341 ms | 4,000 |
| `analysis.gaps.top.all.10k` | 1,685 ms | 5,000 |
| `memo.gaps.10k` | 55.9 MB | 80 |
| `analysis.discovery.10k` | 1,573 ms | 5,000 |
| `analysis.discovery.scaling` | 2.24× | 3.5 |
| `model.memory.50k` | 44.9 MB | 150 |
| `facets.50k` | 190 ms (69 ms idle) | 600 |
| `moves.read` | 0.016 ms | 2 |
| `analysis.neighbourhood.hub` (1,000 renders, 80-link hub, #643) | 186 ms | 600 |
| `analysis.neighbourhood.scaling` (20k ÷ 10k) | 1.01× | 1.5 |
| `reader.pdf.window.600` (2,000 scroll steps through a 600-page paper in Page view, #767) | 7.6 ms, never more than 7 pages drawn | 30 |
| `library.pdf.crop.frames` (Crop margins: 24 sampled dense pages, 1,000 runs and 2,000 operators each, measured and joined into two frames, #769) | 5.5 ms | 25 |
| `library.epub.fxl.window.300` (a 300-page fixed-layout comic turned end to end in Spread, its pages held by the run's own rule, #771) | 1.1 ms, never more than 6 pages held | 5 |
| `reader.overview.600` (the overview of a 600-page paper, a 300-page comic and a 120-chapter book built and scrolled first card to last, ten in view, #776) | 23 ms, never more than 24 pictures held | 100 |
| `library.epub.fxl.css.200kb` (a designed page's 200 KB stylesheet cleaned: fonts renamed, pictures made placeholders, every function checked, #771) | 15.3 ms | 50 |
| `reader.alongside.near.10k` (what is near a 120-word paragraph over 10,000 notes, and its six lenses, #754) | 6.7–11.9 ms | 40 (the promise to the reader is 100) |
| `reader.alongside.vocabulary.10k` (Alongside's index of 10,000 titles and aliases, once per revision, #754) | 11.1–13.0 ms | 50 |
| `reader.lookup.stardict.open.200k` (a 200,000-entry StarDict dictionary and 50,000 synonyms opened for look-up, once per session, #766) | 205–222 ms (555 ms before its words were decoded in one pass; in the app, three real dictionaries — a million synonyms among them — open in ~290 ms) | 750 |
| `reader.lookup.stardict.find.200k` (a later look-up in it: the word found, its dictzip chunk inflated, its entry split, #766) | 0.26–0.39 ms | 3 |
| `reader.scrubber.model.120ch` (the book's line: 120 chapters, 2,000 highlights and 200 bookmarks laid out, once per opening and on each change, #813) | 0.41 ms | 2 |
| `reader.chapter.open` (a 1 MB technical chapter rebuilt from the book, its 360 listings coloured, and laid out in pages, its first page ready, #825 / #824) | 148 ms (86 before its listings were coloured) | 500 |
| `reader.page.turn` (one page turn in Page, the mean of 1,000 through a long chapter, #825) | 0.007 ms, 0 paginations and 0 reflows | 0.05 |
| `reader.relayout` (a long chapter laid out again after a type change and landed on the same line, the slowest of six rows, #825) | 25 ms (its listings re-fitted, written only when their cut changes, #824) | 80 |
| `reader.chapter.turn.start` (a chapter turn's sheet built over a full page and set moving, #825) | 10 ms | 50 |
| `reader.code.chapter.300` (a chapter of 300 listings rebuilt, coloured with Prism's shape and cut into lines, #824) | 40 ms | 200 |
| `reader.chapter.turn.shape` (the nodes that sheet copies for a chapter ten times longer, as a multiple of a short one's, #825) | 0.96× | 1.2 |

Two of these changed what the rest of the epic should do, and they are recorded here rather than
smoothed over:

- **The model layer is fast.** Fifty thousand notes derive and index in about a tenth of a second,
  and cost 45 MB. "Deriving the whole vault on load" was assumed to be the cold-start problem; on
  this evidence it is not.
- **Discovery is the cost.** One projection is a hundred times heavier than every other, and it is
  recomputed on every surface render. That makes *computing once per revision* the highest-value
  change in the epic, not a nicety. It is still the heaviest projection after
  [#530](#530-one-tally-many-readers): the **tally** is the cost, and about a third of what was on
  top of it — an array of every pair, sorted whole — is gone.

## What the budgets have changed so far

| Change | Measured effect |
|---|---|
| [#458 compute once per revision](../architecture/knowledge-state.md#computed-once-per-revision-458) | a second render of an unchanged 10k model: **1,413 ms → 0.073 ms** |
| [#530 one tally, many readers](#530-one-tally-many-readers) | the step that changed, A/B in one process: **1,393 ms → 553 ms**; retained memory **200 MB → 56 MB** |

### #530 one tally, many readers

Discovery built a candidate tally of every pair of notes sharing graph context, copied it into an
array, sorted the array whole, and returned the top three. At ten thousand notes that tally holds
**1,264,125 pairs**: the copy and the sort were a third of the cost of the heaviest projection in
the product, spent entirely on ordering rows nobody would read.

Epic [#529](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/529) needs the same pairs read
four different ways — a list, a lens on the 3D graph, the seams between neighbourhoods, and a
count — and `memoise` keys on the arguments, correctly, so a reader asking for five and a reader
asking for sixty would each have paid for the whole pass. So the expensive half now takes **no
arguments** and is memoised on its own (`analysis.gaps.tally.10k`, 982 ms), and every reader is a
**bounded selection** over it: one linear pass holding at most `limit` results, never a sort.

**How that was measured, and how it was not.** The first attempt compared a full-suite run before
the change against one after it and reported *1,528 ms → 953 ms*. That number does not survive
scrutiny: on this machine the **same code** in a full run measured 953 ms and 1,573 ms on
consecutive runs, because a case that leaves a 56 MB memo entry standing inflates every case
declared after it, and V8's heap never shrinks back. Cross-run comparison here is noise dressed as
a result.

So the effect is measured **A/B in one process, on one warm tally** — the only comparison that
isolates the step that changed — at 10,000 notes and 1.24 million gaps:

| | measured |
|---|---|
| collect + full sort + slice (what it was) | 1,393 ms · 1,437 ms |
| bounded selection (what it is) | 553 ms · 434 ms |

About **three times faster** on the step that changed, over a shared tally of ~960 ms that both
paths pay once. `analysis.discovery.scaling` is unchanged at ~2.3× when the vault doubles — the
*shape* was already fine; only the constant moved.

**And what it costs.** The tally is now **retained** for as long as the model revision stands, where
before it was garbage the moment the call returned. As objects under string keys that measured
**200 MB**; packed into numeric keys (`low * width + high`, the idiom `gapSeams` already used) it is
**55.9 MB**, budgeted as `memo.gaps.10k`. Without that packing `MEMO_MAX_ENTRIES = 64` would have
stopped being a memory ceiling at all.

**Two traps worth naming, because both would have made the gate lie:**

- Each gap case times a model of its **own**, never the suite's shared one. `gapTally` is memoised
  per model instance, so priming the shared model turns `analysis.discovery.10k` into a memo hit
  reading near zero — the budget guarding this cost would silently stop guarding anything.
- A large `limit` used to be **quadratic**: bounded selection `splice`s into an array that grows to
  the whole tally when the reject test can never fire, which measured **18.6 s at three thousand
  notes** and is reachable from `zf.knowledge.discoveries({ limit: 1000000 })`. Past
  `SELECTION_MAX` it collects and sorts instead, and `analysis.gaps.top.all.10k` is the budget that
  keeps that honest.

**And a third, which did.** `view.graph3d.build.10k` reads `buildKnowledgeMap` and
`communitiesOf`, both memoised per model, and it inherited them warm from the cases declared above
it (26–29 ms). When `analysis.tend.10k` began clearing the memo (#644) it started timing all three
cold — 205–250 ms locally, 404–413 ms on CI against a 400 ms ceiling — while `build3DGraph` itself
had not changed. A case that reads a memoised dependency warms that dependency **itself**, as the
gap cases do; it never relies on the order of the cases around it.

## The four reading moments (#825)

Four budgets cover the moments a reader actually waits through: **opening a chapter**, **turning a
page**, **laying a chapter out again** after a type change, and **starting a chapter turn**. They read
a seeded synthetic technical book (`test/perf/generateBook.ts`): a 1 MB chapter of prose, figures,
tables, listings and footnotes, a short one a tenth its size, 300 listings, and a chapter of notes.
`WRITE_BOOK=<file.epub> npx jest test/perf/generateBook` writes it to disk for a walk by hand.

**What jest can prove, and what it cannot.** jsdom has no layout engine, and *Page* is one strip of
CSS columns the browser breaks. So `test/support/readerColumns.ts` lays the chapter out the way the
stylesheet would: from the type the Reader's root wears and the custom properties the pager writes,
lazily, when a box is read. It **counts its reflows**. That is what lets `reader.page.turn` assert
that 1,000 turns lay out **nothing**, and `reader.relayout` assert that each type row lands on the
**same passage**. It is a model, not Chromium. The budgets gate the Reader's own work and its shape;
the browser's paint, its column breaking and its `DOMParser` come from the app.

**The real numbers.** Measured 2026-10-17 in Obsidian 1.14.4, in a separate instance driven over
CDP. The machine was an Intel Core Ultra 7 165H with 31 GB of RAM, on Windows 11 with a 120 Hz
display. The chapters were the longest of a technical book (*A Philosophy of Software Design*, 56
pages) and a long prose book (*Pensar en sistemas*, 87 pages). Each figure is the median / worst
from the request to the next frame. The full method is in
[#825's baseline](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/825#issuecomment-6233162131).

| Moment | Technical | Prose | Target |
|---|---|---|---|
| Open a chapter → its first page on screen | 52 / 60 ms | 37 / 49 ms | ≤ 300 ms |
| A page turn → the next frame | 7.7 / 11.4 ms | 6.3 / 7.6 ms | the frame after the key |
| A relayout (slowest row) → the next frame | 38 / 40 ms | 30 / 45 ms | ≤ 150 ms, same line |
| A chapter turn → its sheet built | 5.5 / 6.5 ms | 4.5 / 5.7 ms | ≤ 100 ms |

There were **no long tasks** (over 50 ms) in any of it. At 120 Hz, none of 80 page turns took two
frames. Every target passed, so none of the optimisations #825 kept in reserve (idle pre-layout,
skipping off-screen work, trimming the bundle) was built. The iPad numbers are still pending; they
are read from the table below.

**One finding the budgets could not have made.** Throttled 20× over CDP, a slow chapter left its
page **empty for 1.6 s**. A 150 ms timer cannot fire while drawing the chapter holds the main
thread. The chapter's waiting state is now laid over the page at once and faded in after the delay by
CSS, on the compositor (`readerWaiting.ts`).

**And the first thing they caught (#824).** The first build of code in technical books failed two of
these, the day after they were set. `reader.relayout` went from 20 to 113 ms and
`reader.chapter.turn.start` from 12 to 87 ms. Fitting the listings to their pages merged every
listing back into one piece before measuring it, on every layout, which cost the page two extra
layouts each time. Now the listings are read as they are (a short one by its box alone) and written
only when their cut changes, which brought relayout back to 25 ms. The column model needed a fix too:
it had counted the chapter turn's sheet, a copy of the page beside the stage, as a change to the page.

## What these numbers do not include

Everything above is the **pure model layer**: snapshots in, ideas and projections out. That is what
makes the harness possible without Obsidian, a DOM or files on disk — and it is a real limit.

Not measured here: `getMarkdownFiles`, the metadata cache, and the fifty thousand `cachedRead`
calls the enrichment pass makes. `enrich.parse` times the parsing; the **reading** is the expensive
half, and it is I/O no synthetic harness can honestly stand in for.

That gap is why the app reports its own timings too.

## Timings from this vault (#462)

**Settings › Advanced** (behind *Show advanced settings*) lists read-only rows fed by the **same
instrument** — they left the Health surface in #645; the live enrichment pass, with its *Stop*, stays
on Tend. What you read there is what was measured on your last launch, on your machine, over your
notes:

| Row | What it timed |
|---|---|
| Loading the plugin | ZettelFlow's own `onload`, first line to last (#795) |
| Building the index at startup | the one build at layout-ready (#795) |
| Building the index | a later rebuild — after a scope or schema change |
| Reading every note for inline fields | the first, full enrichment pass |
| Reading the notes that changed | an incremental pass (#459) |
| The heaviest analysis | the last expensive projection that ran |
| Counting what is left out | the scope's census |
| Laying a chapter out in pages | the Reader's pagination of a chapter (#753) |
| Opening a chapter | a book's flowing chapter, from the open to its first page laid out (#825) |
| Turning a page | a page turn in *Page* or *Spread* (#825) |
| Laying a chapter out again after a type change | a relayout landed on your line (#825) |
| Starting a chapter turn | the turn's sheet built and set moving (#825) |

Each row carries the note count it was measured over and when. The four reading moments also say
**how many times** they ran this session, as *12 times*. A start-up row says no count, because it
runs once. A kind never measured is **absent**, not shown as zero. The newest sample of each kind is
kept beside the 64-sample ring (#825), so a thousand page turns never push *Loading the plugin* out
of the table.

**Facts, and no verdict** (§XII). No score, no band, no colour, no "your vault is slow". A
guardrail test scans the section's strings for comparative and prescriptive words — it rejected
the first title this section was given (*"How fast it is here"*) for containing *fast*, which is
the rule working as intended.

`index.startup.10k` (#795) times the plugin's share of a start: bootstrap, the creation flood
Obsidian announces while it loads the vault, and the layout-ready build, with the conceptual timeline
on and past its 200-note cap. Before #795 the index listened to that flood, and the same case took
3.5–4.4 s; now nothing listens until the layout is ready.

A long pass now also **says it is running and can be stopped**. Its yields are real task
boundaries — a zero-delay timer, not `await Promise.resolve()`, which runs before any paint or
keystroke and so froze the window the progress was being drawn in (#795). Cancelling is safe because every
note is applied whole or not at all: what finished is finished, what was not started stays marked
as changed, and the next pass picks it up.

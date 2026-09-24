# Evolution timeline

Obsidian's file history shows *text diffs* — what bytes changed. The **evolution timeline** shows how
an *idea* changed: the sequence of a note's lifecycle **state** and **claims** over time.

> 2024 "AI will replace programmers" → 2025 "not exactly" → 2026 "automates repetitive tasks" →
> 2027 "becomes a copilot"

## Opening it

Run **"Show evolution timeline"** from the command palette, or click **Open** next to *Evolution
timeline* in **Settings → ZettelFlow → Zettelkasten toolkit**. The pane follows the **active note**
and updates as you switch notes or edit.

## What is captured, and when

A **snapshot** is `{ date, state, claims }` — the note's lifecycle state and its claim texts at a
moment. Capture is **diff-gated** (the pure `recordSnapshot`): a new snapshot is recorded only on a
**meaningful change** — the `state` changed, **or** the claim-text set changed (order-insensitive) —
never on a keystroke that leaves the concept untouched. The first observation of a note records a
baseline.

Capture happens at the `KnowledgeIndex.upsert` choke point (every create/modify), the same point the
[thinking journal](thinking-heatmap.md) uses, so it catches claim edits that don't change state. A
bulk startup rebuild records nothing.

## Cognitive milestones — the living timeline (#362)

The timeline also shows *when you exercised judgement*, not only when the note changed. Each
[judgement](cognitive-agency.md) about the active note — a verdict on an AI proposal, or a Cultivate
friction move you answered — appears on the **same axis** as the snapshots, marked with the accent
colour and carrying its verdict, its optional confidence, and its rationale (on hover). A **"only my
judgements"** toggle isolates the cognitive milestones from the structural snapshots.

The merge is a pure projection, `timelineEvents(snapshots, judgements)`: it interleaves the two logs by
time (a snapshot before a judgement on a tie) and reads only what it is given, so a note you never ruled
on renders exactly the pre-#362 timeline. Judgement events are read from the always-local judgement log
and honour the same [knowledge scope](knowledge-scope.md) — no extra content is stored for them.

## Then and now, on one line (#564)

A claim you were **asked about again** is drawn as one event rather than two: the verdict you gave
and the change it caused, together.

> **Asked again** — and you said what it says now
> *It said* — "microservices increase organizational complexity"
> *It says now* — "microservices move complexity rather than add it"

A confirmation is its own line — *and it still says the same* — which is a milestone this axis could
never draw before, because nothing ever asked you. A withdrawal names the thought the sentence
became (#562) and opens it.

The pairing is a **join, never a guess**: the verdict has to be about this note's claim, land within
five minutes of the snapshot, and the claim set has to have moved by exactly one sentence out and
one in. A bulk edit, a distant verdict, or a claim change nobody ruled on renders exactly as it did
before — two unrelated rows told as one story would be worse than the two rows.

The *only my judgements* toggle keeps it, because a return **is** a judgement.

### The strands render with snapshots off (fixed in #564)

The timeline is opt-in because it stores claim **texts**. That reason never reached the moves, the
thoughts or the verdicts — none of them carries any text — and yet with snapshots off the view drew
*nothing at all*: `recompute()` emptied the stream and returned before those three strands were
read. The guardrail that was supposed to prevent it only asserted that `timeline.enabled()` appeared
somewhere before the merge, which it did.

Snapshots now decide whether there is a **history**, never whether there is a **timeline**. With
them off you still see what you did, what you thought and what you ruled; the missing *it said*
sentence is stated once, at the top, rather than on every row.

## A note you promoted (#581)

The axis has always shown the state **changing** — a snapshot records it. It could not show that
**you decided it**, because Cultivate records its verdicts at the friction step and advancing
deliberately has none.

> **Promoted** — you moved this to literature

It is the same join the return uses, with two extra refusals so a coincidence cannot become a
sentence: the snapshot has to *be* the state the verdict names, and a snapshot where the claim set
also moved stays two rows — two things happened. A verdict it cannot pair renders as the plain
judgement row it already was.

It states the act and nothing else: no word about maturity, and nothing about the note being further
along.

## Thoughts written about the note (#540)

Thinking about a note used to leave no trace on it. *Think about this note* plus a sentence recorded
a thought in the [thinking space](thought-lab.md), but the note's own history never learned it
happened — the Lab records a **move** only when the space is opened with a framed verb, so an
unframed thought fell between the two logs.

Each thought written **about** the active note now appears on the same axis, labelled *"Thought about
this"* and linking to the thought itself. Two properties follow from how it is read:

- **Nothing recorded it.** A thought already carries the note it is about, in its own frontmatter, so
  the strand reads a link that was always in the data. It is therefore **retroactive**: a thought you
  wrote months ago shows up the first time you open the note's timeline.
- **It carries no text.** The row holds an id, a time and a path — never the thought's content. The
  timeline is opt-in because it stores *claim* texts; a strand that smuggled more past that opt-in
  would break the bargain it was granted under.

The merge stays pure — `timelineEvents(snapshots, judgements, moves, thoughts)`, every argument
default-empty — and the lookup reads Obsidian's **metadata cache**, not the files, because the view
recomputes on every change of active note.

## Shareable idea card (#387)

The **Share this idea** button (Timeline header, shown once there is history) turns the timeline into a
single **before→after image** you can post — *"how my idea X grew"*:

- A pure `buildIdeaCard` composes the card from **already-accepted data only** — the first vs current
  snapshot (state + claim counts), the recorded judgement milestones, the note's current link count
  (degree) and its trajectory direction. It **writes nothing** and adds **no new interpretation** (§XII).
- The card is painted onto a canvas (`paintIdeaCard`) and handed to the **A3 export dialog** (#386), which
  previews it and saves a PNG to your attachment folder through the Vault API. No server, no upload.

Because it presents only the current snapshot's link count, the card shows **links now** (an absolute
fact) rather than a fabricated link delta — the timeline stores claim history, not link history.

## Bounds and pruning

The store is bounded so it can't grow without limit:

- **Per note:** the last **20** snapshots (oldest dropped) — the pure `recordSnapshot` cap.
- **Total:** the **200** most-recently-evolved notes (`evictOldestNotes` drops the least-recently
  evolved) — the pure total-notes cap.
- **Pruned** when a note is deleted; **re-keyed** when a note is renamed.

## Privacy

Fully **offline** — no network, no AI. Unlike the thinking journal's path-free day→count tally, the
timeline necessarily stores **per-note lifecycle state, claim texts and timestamps**. Because it copies
note *content* into your vault's local plugin data (`data.json`, which people often sync or commit), it
is **off by default — opt in** under *Settings → ZettelFlow → Evolution timeline* (constitution §VII).
Once enabled the store lives **only** locally, is **bounded** (per-note 20, total 200), is **pruned on
delete** and **re-keyed on rename** (housekeeping runs even when the toggle is off), and turning the
toggle **off clears everything already captured**.

## Architecture

```
recordSnapshot(history, idea, now, { maxLen })   (pure, Obsidian-free, unit-tested)
  → Snapshot[]        diff-gated (state OR claim-set), bounded, immutable

evictOldestNotes(snapshots, maxNotes)            (pure, Obsidian-free, unit-tested)
  → snapshots         keep the most-recently-evolved notes

ConceptualTimeline (singleton, structural TimelineHost, mirrors DevelopmentJournal)
  KnowledgeIndex.upsert → capture(idea) · onDelete → prune · onRename → rekey
  capture gated on the opt-in toggle; prune/rekey run ungated (housekeeping); saves debounced

timelineEvents(snapshots, judgements)             (pure, Obsidian-free, unit-tested)
  → TimelineEvent[]   interleave snapshots (#168) + judgements (#336) by time; snapshot-before-judgement tie-break

EvolutionTimelineRenderer (Timeline mode of the Health surface)
  reads snapshotsFor(path) + judgementsFor(log, path) → timelineEvents(...) → renders snapshots and
  cognitive milestones (verdict · confidence · rationale) oldest→newest, with an "only my judgements"
  filter; writes nothing
```

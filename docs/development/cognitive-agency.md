# Cognitive agency & the judgement record

> Epic [#335](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/335), first piece
> [#336](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/336). The data layer behind the
> [manifesto](../manifesto.md)'s meta-principle: *ZettelFlow removes mechanical work and protects
> cognitive work.*

> See the agency review in action → the [Showcase](../showcase.md).

## The problem this solves

ZettelFlow could already tell you a great deal about how your knowledge **grew**. The
[evolution timeline](evolution-timeline.md) records *what* changed about an idea — its lifecycle state
and its claims. The [thinking heatmap](thinking-heatmap.md) records *that* something happened on a
given day.

Neither records **why**. So the system could say:

> *"This note reached `permanent` and gained four sources."*

but never the sentence that actually matters:

> *"…and you have barely exercised judgement on it."*

An idea can gain links, sources and a lifecycle promotion entirely mechanically — and every signal
ZettelFlow showed would read as healthy. The **judgement record** closes that gap: a human decision
becomes data, so *cognitive agency* is a **consequence of the model** like every other metric, never an
invented dashboard number ([constitution §XI](constitution.md)).

## What a judgement is

One decision you made about one idea:

| Field | Meaning |
|---|---|
| `at` | When you gave the verdict. |
| `path` | The note it was about. |
| `subject` | A **short, locale-free descriptor** of what was judged — an action id (`challenge-idea`), a cultivation move (`connect`), a relation (`supports:ideas/atomicity.md`). |
| `origin` | Where the proposal came from: `ai`, `derived` (a deterministic projection) or `human` (your own initiative). |
| `verdict` | `accepted` · `modified` · `rejected` · `confirmed` · `challenged`. |
| `note` | An optional short **rationale**, captured at the verdict moment — the reasoning you type on an AI proposal, or the reading you commit on a Cultivate friction move. Omitted when blank. |
| `confidence` | An optional **how-sure** marker — `low` · `medium` · `high`. Omitted when you did not say (#361). |

`origin`, `verdict` and `confidence` are **closed unions**, so each always means one of a fixed set of
things and the i18n layer maps them to text. `note` and `confidence` are always optional: a bare verdict
records exactly as it did before them.

## What it deliberately does not store

**No note content. No model output. Ever.** `subject` is an identifier, not the text that was proposed
— so rejecting an AI suggestion records *that you rejected `challenge-idea` on this note*, never the
suggestion itself.

That is why the record is **on by default**, unlike the [evolution timeline](evolution-timeline.md),
which is opt-in precisely *because* it stores claim texts. It is strictly local, bounded to the most
recent 500 verdicts (oldest dropped), never networked, and it honours the
[knowledge scope](knowledge-scope.md): a note under an excluded path never becomes an idea, so it never
accrues judgements either.

## What is derived from it

All pure, all offline, all reachable through the Knowledge State barrel:

- `judgementsFor(history, path)` / `lastJudgementFor(history, path)` — the verdicts on one idea.
- `agencySignals(history, path)` — counts by verdict and by origin, when it was last ruled on, whether
  any verdict carried a rationale (`hasRationale`) and the confidence of the most recent one
  (`lastConfidence`).
- `judgementDays(history)` — verdicts per UTC day, reusing the heatmap's own day key so the two
  definitions of "a day" cannot drift.
- `trajectory(model, history, now)` (#364) — every well-connected idea placed on an *advancing / steady
  / stalled* spectrum by how recently you ruled on it: the read side of *"is this idea moving, or has it
  stalled?"*. A stalled idea grew but carries no recent verdict; `unexaminedIdeas` (never ruled on) is
  its `lastMovementAt: null` extreme. Queryable from a script as `zf.knowledge.trajectory()`. Still no score.
- `verdictBreakdown(history, opts?)` (#388) — a vault-wide tally of your verdicts, optionally scoped to
  certain origins. Pass `INTERPRETIVE_ORIGINS` for the **AI accept/modify/reject rate**. Counts only.
- `agencyIndex(history, opts?)` (#388) — of the interpretive (AI/derived) proposals you ruled on, the
  share you **shaped** (modified/rejected/challenged) rather than accepted as-is. `index` is `null` when
  there is nothing to describe. Both are queryable as `zf.knowledge.verdictBreakdown()` /
  `zf.knowledge.agencyIndex()`, computed **only** from the log — local, never transmitted.

### There is no score

`agencySignals` exposes counts and a timestamp — **no score, no ratio, no grade**, and a test asserts
those keys are absent. An idea nobody has ruled on reads as a well-defined **unknown**, not a failing
mark. The signal names an *idea* and proposes a *move*; it never grades **you**.

`agencyIndex` (#388) does return a ratio, and the distinction matters: it is a **description of your
verdict mix, not a score of you**. A low value can simply mean the proposals were good — it is never a
"cognitive surrender score". `index` is `null` (an *unknown*) when there is nothing to describe, and the
metric is local to your vault and never transmitted. It measures the *gate* (how interpretive output was
handled), not the person.

This is not a technicality. A "cognitive surrender score" would be exactly the moralising,
gamified thing epic #335 exists to avoid — the right question is never *"how much did the user do?"*
but *"has their understanding changed?"*

## Reviewing your decisions

The **Agency** tab on the Health surface (#389) makes the record something you can *look at*. It is a
**read-only, local** view — nothing is written back, nothing is transmitted:

- A compact **header** — the cognitive agency index (`agencyIndex`), the interpretive
  accept · modify · reject breakdown (`verdictBreakdown`), and a one-line plain-language **reading**
  (*deciding · mixed · accepting · unknown*). The reading is a description of your verdict mix, **not a
  grade**; below a small sample it reads *unknown*, never zero.
- A **newest-first list** of every recorded decision — the note, the verdict, its origin, your
  confidence and rationale when you gave them, and when. Each row opens the note.

The header numbers come straight from the C5 queries (`agencyReviewModel` composes them), so the tab
and a script's `zf.knowledge.agencyIndex()` can never disagree. Empty log ⇒ a friendly empty state;
recording off ⇒ a prompt to enable it in settings.

## The other half: your own readings

AI proposals fill the record with `origin: "ai"`. [Cultivate](cultivate.md) fills it with
`origin: "derived"` (#338): when a move asks for your reading before revealing its own and you answer,
that is a judgement too — `challenged` when you argued against your own idea, `confirmed` when you
committed a prediction about it.

Skipping the prompt records nothing. The reading you commit is stored as the judgement's `note`, so the
record keeps not just *that* you reasoned but *what* you reasoned; an optional confidence selector rides
along on both surfaces (#361). Between the two origins, the record can finally distinguish an idea that
*grew* from one you actually *reasoned about* — which is what #339 projects.

## What the record finally lets the system say

> [#339](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/339). The read side.

`unexaminedIdeas` names the ideas that have **gained structure but carry no verdict at all** — neither
an AI proposal you ruled on nor a friction prompt you answered. That is the sentence this whole chapter
exists to make sayable:

> *“This idea grew structurally, but you have barely exercised judgement on it.”*

It appears in two places you already know, and nowhere new:

- **Home** — as a row in the existing *what to do next* list, under the reason **grew without your
  judgement**. Not a new widget.
- **Health** — as one more section in the existing surface. Not a new view.

An idea only qualifies once it is **well connected** (degree ≥ 3). A brand-new note nobody has ruled on
is not neglected, it is *new* — without that floor a fresh vault would open as a list of failures.

### The streak changed meaning

The development streak now counts **days you exercised judgement**, not days something happened. It was
the one signal in the product that rewarded mere activity, so it is exactly the one that had to change.
One definition (`JudgementLog.dailyCounts()`) feeds both Home and Cultivate, so they cannot drift.

The [thinking heatmap](thinking-heatmap.md) deliberately did **not** follow: it is a *history* of what
you developed, not a reward mechanic, and switching it would have thrown away a year of journal data to
add no insight. The two answer different questions and say so.

### Still no score

Everything above returns **ideas**, never a number about you — no ratio, no percentage, no
examined-vs-total pair a reader could turn into a grade. Tests pin the absence of `score`, `ratio` and
`grade` from these shapes. The signal names an idea and invites a move; it never grades **you**.

## Where it lives

| Layer | Module |
|---|---|
| Knowledge Model (pure, offline) | `architecture/knowledge/judgement/` — the shape, `recordJudgement`, the projections |
| Workflow Engine (runtime) | `architecture/plugin/judgement/JudgementLog` — scope filter + debounced persistence + flush on unload |
| Settings | `settings.judgements = { enabled, log }` |

`recordJudgement` mirrors `recordSnapshot`: immutable, bounded, and it returns the **same array
reference** on a no-op — a malformed entry, or an exact repeat of the last one, so recording twice is
idempotent. A corrupt persisted blob degrades to an empty log instead of throwing.

## Where the record fills up: AI proposals

The first thing that writes to the record is the AI category (#337). Every completion is shown as a
**proposal** before it can reach a note:

| You do this | Written | Recorded |
|---|---|---|
| Accept it unchanged | the completion | `accepted` |
| Edit it, then accept | **your** text | `modified` |
| Reject it | nothing | `rejected` |
| Dismiss the dialog | nothing | **nothing** — a dismissal is not a verdict |

The reviewed text is the unit of decision, so an action that parses its output (questions, labels)
parses *your edit* the same way it would have parsed the model's.

And because an automation has nobody to ask, **AI never runs headless at all**. The old
*Allow AI in automations* toggle was removed in #337 rather than kept as a hole in the principle: it
would have authorised paying for a completion that could never be written.

## What comes next

Nothing reads the log yet. It is the foundation for the rest of epic #335:

- [#337](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/337) — **agency-aware AI**: a completion
  becomes a proposal you accept, modify or reject, and the verdict is recorded
  ([constitution §XII](constitution.md)).
- [#338](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/338) — **deliberate friction** in
  [Cultivate](cultivate.md): your reading before the reveal.
- [#339](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/339) — **agency as a consequence**: the
  development streak counts days you *ruled on something*, rather than days something happened.

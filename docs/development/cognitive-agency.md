# Cognitive agency & the judgement record

> Epic [#335](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/335), first piece
> [#336](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/336). The data layer behind the
> [manifesto](../manifesto.md)'s meta-principle: *ZettelFlow removes mechanical work and protects
> cognitive work.*

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
| `note` | An optional short remark. Omitted when blank. |

Both `origin` and `verdict` are **closed unions**, so a verdict always means one of a fixed set of
things and the i18n layer maps them to text.

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
- `agencySignals(history, path)` — counts by verdict and by origin, plus when it was last ruled on.
- `judgementDays(history)` — verdicts per UTC day, reusing the heatmap's own day key so the two
  definitions of "a day" cannot drift.

### There is no score

`agencySignals` exposes counts and a timestamp — **no score, no ratio, no grade**, and a test asserts
those keys are absent. An idea nobody has ruled on reads as a well-defined **unknown**, not a failing
mark. The signal names an *idea* and proposes a *move*; it never grades **you**.

This is not a technicality. A "cognitive surrender score" would be exactly the moralising,
gamified thing epic #335 exists to avoid — the right question is never *"how much did the user do?"*
but *"has their understanding changed?"*

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

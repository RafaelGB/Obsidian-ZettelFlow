# A thought you can be wrong about

> Epic [#560](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/560) — the fields (#570), the
> resolution (#571), the mark on the timeline (#572) and the wall (#573).

The [manifesto](../manifesto.md) says thinking should help you understand better and live better.
Everything ZettelFlow records is on the first half of that sentence, and all of it is **internal**:
a note changed, a link appeared, a claim was rewritten, a verdict was given.

**Nothing in this product had ever been checked against what actually happened.** The timeline made
it visible: every event it could draw was in the past. There was nothing here you could be *wrong*
about — and something you cannot be wrong about is something you cannot learn from in the strongest
sense of the word.

A wager is the smallest object that changes that:

```
a claim  +  what you expect to see  +  by when
        ↓            (time passes)
   "what actually happened?"        ← asked before you are shown what you predicted
        ↓
   expected / happened, side by side
        ↓
   the claim stands, or it changes
```

No calendar, no sensor, no service, no integration. **You are the instrument.**

## Naming what you expect

The [claim door](claim-returns.md) has two more optional lines: *and what you expect to see*, and
the day you expect to know by. Skipping them is the normal path — most claims are not wagers, and a
form that insists is a form nobody uses twice.

They are plain frontmatter on the note, beside the claim:

```yaml
claim: microservices move complexity rather than add it
expect: two teams stop waiting on each other
by: 2026-12-01
```

A prediction you cannot open with your own tools is not yours, so you can write, edit or delete
them by hand and the product reads them exactly the same way.

**Both halves, or it is not a wager.** An expectation with no date cannot be resolved, and a date
with no expectation is a reminder — which is the thing this epic refuses to become. It also means a
note whose `by:` means an author is left alone.

**A day you typed is a day where you are.** The horizon is read as the start of its own *local*
day. `2026-12-01` parsed as UTC midnight would come due the evening before for everyone west of
Greenwich, and *never before its horizon* is the promise a user would notice breaking.

## What actually happened

When the day arrives, Home offers it — the same single line a returning claim uses, because *at
most one thing at a time* holds across both. Open it and the question comes first, with what you
predicted **nowhere on screen**:

> **What actually happened?**
> *Answer from what you saw. What you expected stays shut until you do.*

You write. The observation is saved as a thought about the note — it survives first, the same
ordering a withdrawn claim has — and **then** both sentences appear together:

> *You expected* — two teams stop waiting on each other
> *What happened* — they still waited, but on a different thing

No tick, no cross, no colour of success or failure, and no word about which one you wrote. Below
them the claim's own three answers, unchanged: *it still says this* · *it says this now* · *I no
longer hold this*. Choosing one clears the horizon in the same write, so a wager resolves once.

*It says this now* asks for the **new sentence** in its own box, because here the text you typed is
an observation — committing it would write *"they still waited"* into the note's claim.

## One mark in the future

With the [evolution timeline](evolution-timeline.md) on, the horizon is the first thing this axis
has ever drawn that has **not happened**:

> **Expected** — you said you would know by then
> two teams stop waiting on each other

The axis is an ordered list, not a scaled one, so a date two years out costs nothing and moves
nothing. The row is muted and says the same thing at every distance, before and after the day
arrives.

## What it will never be

- **No accuracy, no hit rate, no calibration, no correct or incorrect.** A hit rate is an invented
  score about the user, which §XI refuses as a metric and §XII refuses as a judgement — and this
  project [deleted its telemetry on purpose](project-health-and-roadmap.md). A self-scoring
  dashboard is telemetry pointed inward. A scan over all of `src/` and both locale files holds the
  line, and carries its own planted strings so the scan is proved rather than trusted.
- **No habits, no streaks, no repetition.** A wager resolves once.
- **No reminders and no notifications.** One line in Home, the same one a claim return uses.
- **No list of open wagers with a count.** There is no aggregate over wagers anywhere in the model,
  so there is nothing a surface could render.
- **No external data.** No calendars, wearables, trackers or imports. The observation is a sentence
  you write, and that boundary is not negotiable here.
- **No AI judging the outcome.** A model deciding whether you were right is the single most
  §XII-hostile thing this product could do.

The two sentences beside each other are the entire feedback, and they are enough: nobody needs to
be told which one they wrote.

## Honest limits

- **Nothing records that a wager was resolved.** It stops being due because its two fields are
  **gone**, not because a flag was set — and a reader looking for a `resolved` field should not add
  one.
- **A wager needs a thinking-space folder**, because the observation is written as a thought. With
  none set, wagers are not offered at all and the hand-opened return says why in one sentence.
- **A horizon that passed unresolved changes nothing.** It is offered the same way, once, whenever
  you next look: no escalation, no repetition, no ageing.
- **A renamed note keeps its wager**, because the fields live in the file — while the moves and
  judgements about it deliberately do not follow the rename. That asymmetry is correct, and it is
  stated here rather than fixed.
- **This was shipped on a design hypothesis.** No vault anywhere contained a wager when it was
  written, so unlike the neighbourhoods or the gaps, its premise could not be checked against data
  that already existed. The first real evidence is someone setting a horizon two days out and
  resolving it.

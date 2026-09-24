# What this note claims, asked again

> Epic [#558](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/558) — the claim gets a door
> (#561), the return asks before it shows (#562), it comes back without a scheduler (#563), and the
> timeline tells both halves as one line (#564).

ZettelFlow could already show how an idea changed. The [evolution timeline](evolution-timeline.md)
interleaves snapshots, judgements, moves and thoughts; the [agency review](cognitive-agency.md) says
whether an idea grew mechanically or because you decided something; the idea card exports a
before→after you can post.

Opened on a real vault, all of it was **empty** — because every one of those reads the same thing,
*the sentence you would defend*, and the only way to write one was to type YAML into a note by hand:

```yaml
claim: microservices increase organizational complexity
```

Measured on the reference vault when this shipped: **0 of 94** notes in scope carried a claim, and
**0 of 200** tracked notes had ever changed one. [§XIII](constitution.md) names that exact failure —
*a capability whose only authoring path is hand-edited YAML is not shippable.* This is the
correction, and the second half of it is the part that makes the first half worth having: the claim
**comes back**.

```
say it  →  (weeks)  →  asked again, before it shows you  →  then / now  →  it stands, or it changes
```

## Saying what a note claims

One entry on the note's own menu — right-click in the note, on its tab, or on its file — beside
*Make a move…*: **say what this note claims**. There is also one control in
[Cultivate](cultivate.md), on the note it is already showing you.

It opens a single sentence box, prefilled with what the note already says — and **one optional
second line**: where it came from. Type a note name and pick it (it is written as a `[[link]]`), or
type anything else and it is kept verbatim. Skipping it is the normal path.

That line exists because of what #561 shipped without it: a claim with no `source` **is**
`unsourced` by definition, and that category carries weight in the
[knowledge debt](knowledge-dashboard.md). The door asked you for a sentence, got one, and answered
with a penalty it never mentioned. The interface still never says a claim is missing anything —
that conversation lives on the debt page, which is a page you choose to open.

Beyond those two lines the gesture asks nothing: no kind picker, no confidence, no tags. A gesture
that opens a form is a gesture nobody repeats.

- It writes the `claim` property through `FrontmatterService`, so the write lands in the
  [write record](../architecture/reversibility.md) and can be taken back like any other.
- A note that says several things keeps saying them; the box edits the **first**.
- Stating a claim records one [judgement](cognitive-agency.md) — the note, the subject
  `claim:<path>`, origin `human`, verdict `accepted`. The sentence is on the note, never in the
  record.
- The entry appears only for a note inside the [knowledge scope](knowledge-scope.md). An excluded
  path never becomes an idea, so it never carries a claim either.

There is **no command** for it: the palette is where you go looking for something you know is there,
never where you discover anything (#496).

## Asked again, before it shows you

Weeks later, **Home** shows one line: *something you wrote is ready to be looked at again*, with the
month you wrote it. Open it and the question comes first, with the note shut:

> **What do you say about this now?**
> *Answer from what you think today. The note stays shut until you do.*

While it asks, it shows **what the claim cites**, because *do you still say this* and *on what
evidence* are the same question. It does not ask you to re-source it.

You write. **Then** it shows you what you wrote before, beside what you just wrote. Reading it first
would take your own answer away — you would agree with yourself and learn nothing — so the stored
sentence is not in the view model at all until an answer exists. It is structural, not a matter of
discipline: there is nothing on screen to leak.

Three answers, and none of them is marked as the better one:

| | |
|---|---|
| **It still says this** | One `confirmed` verdict. **Nothing is written to the note** — agreeing with yourself is not an edit. |
| **It says this now** | The claim is rewritten through the write seam, and one `modified` verdict is recorded. |
| **I no longer hold this** | The sentence goes into the [thinking space](../architecture/thought-lab.md) as a thought carrying the note it came from, and *then* leaves the note. One `rejected` verdict. |

The third one never destroys a sentence. A rejected conclusion is part of your intellectual history
— the Lab keeps what is *decided against* for the same reason — so withdrawal is the exact inverse
of crystallize. If the thinking space has no folder set, the third answer is not offered and the
interface says why.

Nothing here is lost by leaving: the half-sentence you typed is held outside the DOM, so closing the
return to go and look at the note costs nothing.

You can also open a return yourself, from the command **Look at this claim again** — which is what a
palette is for, and which records `human` rather than `derived`, because *I chose to revisit this*
and *I answered what I was asked* are not the same act.

## How it comes back

There is no scheduler. `review.due` has been a reserved token in the
[workflow-event vocabulary](../architecture/event-driven-workflows.md) since #150 and now means one
thing: *a claim you stated is ready to be looked at again*. A flow can bind to it like any other
event, and the trigger dropdown offers it with no special case.

The sweep that fires it adds **no timer and no listener**: it rides the engine's arming and its
existing debounced metadata pass, and returns immediately unless a flow is actually bound to the
event. Once per note per day, through the same throttle every other event uses.

What counts as having touched a claim — the newest of these four:

- the last time its **claim set changed**, from the timeline's snapshots (not the last snapshot: a
  lifecycle promotion is not you saying anything new);
- the note's **`last-reviewed`** property — which this is the first thing in the product to read;
- the newest **verdict** on that claim, whatever it said;
- the note's **modification** time, as the floor.

**Settings → ZettelFlow → Thinking → Coming back** is the one duration, 7 to 365 days, default 90.

## Then and now, on one line

With the [evolution timeline](evolution-timeline.md) on, a claim that changed and the verdict that
caused it are drawn as **one** event:

> **Asked again** — and you said what it says now
> *It said* — microservices increase organizational complexity
> *It says now* — microservices move complexity rather than add it

A confirmation is its own line (*and it still says the same*), which is a milestone the timeline
could never draw before. A withdrawal names the thought the sentence became, and opens it.

The pairing is a join, never a guess: the verdict has to be about this note's claim, land within
five minutes of the snapshot, and the claim set has to have moved by exactly one sentence out and
one in. A bulk edit, a distant verdict, or a change nobody ruled on renders as it did before — two
rows told as one story would be worse than the two rows.

**Share this idea** now carries both sentences, not only how many claims there were.

## And a claim you can be wrong about

A claim is a sentence you would defend. Add **what you expect to see** and **by when** and it
becomes something else: a [wager](wagers.md), the only thing in this product that can be checked
against what actually happened. The day it arrives, the return asks *what happened?* before it shows
you what you predicted — and then the same three answers resolve the claim.

## What it deliberately does not do

- **It never counts.** Not returns due, taken or missed. No streak, no badge, no status-bar number,
  and nothing that grows while you are not looking. An inbox is a debt that greets you with how far
  behind you are, and this is the front door. A guardrail scans this feature's sources and both
  locale files, and it has already caught one sentence.
- **Nothing is overdue.** A return you ignore looks exactly the same tomorrow: no red date, no
  repetition, no escalation, no reminder.
- **It asks for one thing at a time.** At most one claim is ever offered, and it is the oldest.
- **It does not adapt.** The interval is a duration you chose. There is no ease factor, no
  algorithm, and no per-claim schedule.
- **It never writes your sentence for you.** `ExtractClaims` exists, is AI, and keeps its §XII
  gate. This door is for *your* sentence — the whole value of the return is that what comes back is
  yours.

## Honest limits

- **With the evolution timeline off**, there is no *it said* sentence to show. The loop still works —
  the door, the return and the verdicts need no snapshots — and the timeline says once, at the top,
  that the sentences are not being kept.
- **Editing the note resets the clock.** The note's modification time is one of the four things that
  count as having touched a claim, so a note you are actively working on will not come back at you.
- **The once-a-day gate lives in memory.** A reload lets `review.due` fire again the same day for a
  claim that is still due.
- **A claim is the first one.** A note that says three things is asked about the first of them; the
  claim set is compared order-insensitively, so *the one changed longest ago* is not derivable from
  anything stored.
- **A verdict does not follow a rename**, exactly as a move or any other judgement does not. The
  claim itself does, because it lives in the file.

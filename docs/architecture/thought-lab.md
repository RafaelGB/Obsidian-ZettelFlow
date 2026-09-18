# The Thought Lab

Every object ZettelFlow has presupposes the thinking already happened.

A note wants a title and acquires a lifecycle state. A typed relation is a judgement you already
made. A claim has a source. An inquiry starts from a concern you can already state. Even Cultivate
asks *what shall we do with this idea* — which assumes you have one.

There was nothing, anywhere in the product, for **"I don't know what I'm thinking yet."**

And that is the state a thought is in when it matters most: absurd, contradictory, intuitive,
speculative, half-wrong on purpose. The old answer was *write a note* — and a note immediately
asks for a title, becomes an orphan, shows up in Health and adds to your debt. The system asked
you to be finished before you had started.

```
impulse → thought → idea → knowledge
```

The Lab is the first arrow.

## A thought asks for nothing

| A note | A thought |
|---|---|
| a title | — |
| a lifecycle state | — |
| structure | — |
| to be right | — |
| becomes an orphan | never |
| counts toward debt | never |
| appears in Health | never |

What it carries: **when** it was written, **what** it says, and optionally that it *forked from*
another thought or *challenges* one. Three words is a thought. A contradiction is a thought. So is
something you wrote deliberately wrong to see what it looked like.

## Not knowledge, by construction

This is the part worth understanding, because it is the whole safety of the idea.

The Lab folder goes into **`scopeExcludedPaths`** — the same array that already carries
ZettelFlow's own flow, hook and library folders (#311). That one place decides what is not
knowledge, and everything downstream reads from it: the `KnowledgeIndex`, Health, debt, Discovery,
orphans, resurfacing, Cultivate's queue, every projection.

No second mechanism. No flag a future change could forget to check. A thought is invisible to the
system for exactly the same reason a flow canvas is.

The guardrail (`test/architecture/knowledge/thoughtScope.test.ts`) does **not** check the setting.
It builds a real model over a vault whose Lab is full and demands zero — because the
`useSettingsHost` load-order trap (#374) once made `excludedPaths` silently return `[]`, turning
every exclusion into a no-op while the settings object looked perfectly correct.

## Your files, in your vault

Thoughts are markdown files in a folder you choose. Not `data.json`: **data you cannot open with
your own tools is not yours**, and the promise of this layer is that what you write here remains
yours even though the system ignores it. Open them, search them, sync them, grep them.

The text is the **body**, so what Obsidian shows is what you typed:

```markdown
---
zfThought:
  id: a1b2c3d4
  at: 1758153600000
  links: [e5f6g7h8]
  challenges: e5f6g7h8
---

maybe the problem isn't that AI thinks worse than us
```

A file in that folder with no `zfThought` at all is **still a thought** — just text. Someone will
write a note there by hand, and that is allowed. A refuge that rejects what you put in it is not
one.

Writes go through `FileService` like every other write (#456), so a thought lands in the
[write record](reversibility.md) and can be taken back.

## The folder

Settings → **Thinking** → *Thought Lab folder*. Default `_ZettelFlow/lab`. Point it at an empty
folder: anything already in there becomes invisible to the knowledge model.

## The space

**Home → Lab**, or the **Think** command. A mode of the Home surface, not a fourth leaf type:
`ModeHostView` already owns the switching, the deep links and the lifecycle, and a new view would
be exactly the addition subtraction exists to refuse.

The command's whole promise is a **blinking cursor**. No modal, no folder prompt, no kind picker,
no title — a guardrail asserts there is nothing in its path that asks a question, because the
moment a thought matters most is the moment it is most likely to be lost.

### Four moves, and there will not be a fifth

| | |
|---|---|
| **Fork** | a variant that goes its own way. Both survive; neither is the parent. |
| **Challenge** | a thought that argues with another. **Neither is marked right.** |
| **Connect** | two clicks: arm on one, land on the other. Plain and untyped — never a semantic relation. |
| **Leave** | not a button. It is what closing does, and it costs nothing. |

Everything else — collision, constraints, perspectives, question transformations — belongs to the
operator engine in phase 2. A fifth move here would start the feature collection this epic exists
to prevent, and a test says so.

### Thinking reads downward

An answer sits **under what it answers**.

The lab's first list was flat and sorted by clock, so a counterpoint you had just written appeared
at the *top*, nowhere near the thought it argued with. That was not a layout problem with a layout
fix: `forkedFrom` and `challenges` were two fields saying the same thing — *which thought is this
a response to* — and nothing in the data said they formed a shape.

They do. A thought responds to **at most one** other:

```yaml
respondsTo: a1b2c3d4
respondsAs: challenge     # or: fork
```

That single parent is what makes the lab a set of **threads**, and a thread is the thing you
actually want to re-read: *I thought this, then I doubted it, then I found the flaw.*

`threadThoughts` builds them, and its rules are the interesting part:

- Roots come **newest first** — the thread you were just in is the one you want.
- Children come **oldest first** — a conversation reads downward.
- A response whose parent was thrown away becomes **a thread of its own**. Nothing is ever
  dropped; losing a thought because its parent went is the worst thing this surface could do.
- A cycle, which only a hand-edited file can produce, is broken rather than recursed into.

### Connections are lateral, because a graph cannot nest

`connect` is undirected, can be many, and can cross threads — so it is **not** part of the tree.
A connected thought appears as a chip beside the card, showing its first words; clicking one
scrolls to it and flashes the card you landed on. A chip whose thought is gone says so rather than
disappearing.

That is the split: **responses nest, connections point.**

### Nothing is committed on a timer

A pause while writing is **thinking, not a boundary**. The first version of this surface saved a
new thought on a debounce, and it was unusable: stopping for half a second turned half a sentence
into a card, the surface rebuilt itself, and the cursor was gone.

So a new thought is written down only at a real boundary — `Ctrl`/`Cmd`+`Enter`, or leaving the
box — and committing **never rebuilds the surface**: the card is inserted and the composer cleared
in place. Editing a thought that already exists *does* save on a debounce, because there the file
exists and nothing moves on screen.

Two rules hold it together, each stated in exactly one place:

- **Nothing redraws while a text box has focus** (`refresh()`).
- **The draft lives outside the DOM**, so even a redraw that does happen cannot lose it.

Fork and challenge do not create an empty card either: they **arm the composer**, so a relation
costs a sentence instead of an empty file you have to go back and fill. And the actions fire on
`mousedown` rather than `click`, because the composer commits on blur and a click that lands after
a redraw is a click that never happened.

### Leaving must never cost a sentence

Writing saves on a short debounce, on blur, and on close. A refuge that loses what you typed
because you switched tabs is not one.

### Throwing one away

A refuge you cannot tidy becomes a junk drawer, so a thought can be **thrown away** — and, like
everything else ZettelFlow removes, it goes to **Obsidian's trash**, never to a delete.

The undo appears **where the card was**, not as a toast: this surface must not interrupt, and a
strip in the space the card occupied is closer to where you are already looking. The thought is
held in memory, so putting it back is instant.

Note the difference from *decided against*: that one **keeps** the thought, because a rejected
conclusion is part of your intellectual history. Throwing away is for the typo and the false
start.

### Saying what the moves do

An icon is quick once you know it and opaque until you do. So every action carries a tooltip that
says what it *does* rather than what it is called, and the header has a **What do these do?**
legend — one sentence per move, closed by default, because a legend you cannot dismiss is clutter
for everyone who already read it.

Colour distinguishes what a thought is to another: a fork takes the blue rule, a challenge the
orange one. That is a distinction, never a verdict — neither side is marked right.

Feedback is deliberately small: a card fades in when it arrives, its rule pulses green for a
moment when an edit is saved, and it slides out when thrown away. All of it respects
`prefers-reduced-motion`.

### It never counts

No total, no badge, no "you have 17 thoughts". A guardrail scans the whole of `src/` — not just
the Lab — for anything that counts thoughts, and scans this surface's strings for the vocabulary
of debt. A counter would destroy the thing the Lab is for, and it would not be added in this file
when it happened.

## Crystallize — the only door

Pick out the thoughts that turned out to be an idea, and **Crystallize**. A note appears in your
real graph, in the real model, with everything a note has.

### The archaeology survives

Zettelkasten rewards thought that is already clean: a note arrives with a title and a claim, and
the twenty minutes of contradiction that produced it are gone. Here the note keeps both halves of
its provenance:

```markdown
The idea, as you wrote it.

## Born from
- "maybe the problem isn't that AI thinks worse than us"
- "or maybe that's a simplification"
- "what if the real problem is speed"
```

**Links and frozen quotes.** Links let you navigate back while the thoughts exist; the quotes are
plain text, so the record is still readable after you empty the Lab. A record that points at a
deleted file answers nothing — the same reasoning that makes the [write record](reversibility.md)
keep previous values rather than a pointer.

Quotes are clipped and capped, and a capped one says *and 4 more* rather than silently dropping
them.

### It is the §XII verdict

The [constitution](../development/constitution.md) requires that interpretive output reach the
vault only through an explicit human accept/modify/reject, recorded. Everywhere else in ZettelFlow
that is a defensive guardrail on AI and heuristics. **Here it is the mechanic.** The Lab is where
interpretation happens; this is the gate it passes.

So the guardrail is about who may open the door: a test asserts `crystallize()` has exactly **one**
caller, that it sits behind a button you press rather than a lifecycle hook, and that neither it
nor the modal touches AI. The verdict goes to the same `JudgementLog` as every other — subject
only, never content.

### Nothing is consumed

Crystallizing does not delete, move or lock the thoughts. The same chaos can produce a second idea
next month, and a door that eats the room behind it is not a door. A test asserts the applier
cannot reach a delete.

The title and the body are **proposed, never imposed** — a proposal that is hard to change is an
imposition. Cancelling writes nothing at all.

## Set it aside

Some ideas should not be processed. Not developed, not linked, not classified, not turned into a
note, not resolved — just **left alone**, without that meaning abandoned.

Two reasons, one state:

| | |
|---|---|
| **Set aside** | not now. |
| **Decided against** | you rejected it — and it is **still kept**, because a conclusion you rejected is part of your intellectual history, and the context that made it wrong can change. |

### Why this is in phase 1

Every tool's answer to "leave this alone" is an inbox, and **an inbox is a debt**: a list that
grows, counts itself, and greets you with how far behind you are. Without this, the Lab would be
another inbox. That is why it shipped alongside the space rather than after it.

### The rule, and the test that is the feature

**Nothing here ever counts at you.** No total, no badge, no ribbon number, no status bar, no
notification, no reminder, no "you have 17 waiting". Coming back is your move.

`test/application/thinking/noDebt.test.ts` is where most of this feature's weight lives, because
the requirement is negative. It scans **all of `src/`** — not just the Lab — for anything counting
thoughts, and the Lab specifically for badges, status-bar items, intervals and scheduled returns.
Then it scans the strings for the vocabulary of debt: *pending, overdue, waiting, remaining,
backlog, inbox, due, should, must, still*.

A counter would destroy the thing the Lab is for, and it would not be added in `incubation.ts`
when it happened — it would be added in a ribbon, or in Home. Hence the scope of the scan.

What you set aside sits behind **a door, not a queue**: closed by default, labelled with a name
rather than a number.

### Being welcomed back

When you reopen something, it says what you stopped at and **what has been written since** — notes
created after that moment that share a word with what you were stuck on, in the order they were
created.

Mechanical, and deliberately dull. *"This appeared since"* is a fact; *"this is now promising"* is
a judgement, and it is yours (§XII). A test asserts `appearedSince` sorts by creation time and
that the module's code contains no notion of score, rank, relevance or weight.

## Think before you look

When you ask your vault a question it answers immediately — and the moment it does, **your own
answer is gone**. You never learn what you thought before you read it, and you never notice the
thing worth noticing: that you had already worked this out two years ago and forgot.

Every tool in this space optimises for retrieving what you knew. None preserve what you thought
*before* you retrieved it, which is the only way to watch your own reasoning move.

So the Lab can wait:

1. You ask a question.
2. It asks **what do you currently think?** — and shows nothing.
3. Your answer is stored as a thought, **before** anything is revealed.
4. Then it shows what your vault holds, side by side with what you said.
5. You say what changed in you: *nothing* · *I had forgotten this* · *I was wrong* · *I still
   think so*.

That last step is recorded as a verdict in the same `JudgementLog` as every other — subject only,
never content.

### The leak is impossible, not forbidden

The one requirement this feature exists for is that nothing from your vault appears before you
answer. A careless re-render would break that silently, and a source scan would not catch it.

So `blindView` **does not return** what the vault holds until there is an answer. Before you
submit, it is not hidden — it is **absent from the view model**, and the renderer has nothing to
draw even if it tried. A test asserts the serialised view contains no trace of a note that was
already fetched.

### It is a choice, and it is not a quiz

The normal *ask your graph* surface is untouched; nobody is made to guess before searching.

And there is no tally, no accuracy and no streak — that would turn thinking into a game with a
loser. *"I was wrong"* is available because it is **your** word about **yourself**; what must not
exist is the system saying it. A guardrail scans the strings for *correct*, *accuracy*, *score*
and their relatives.

Offline, and no AI.

## What is not here yet

Phase 2 of [epic #465](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/465): the operator
engine (collision · constraints · perspectives · question transformations, as **one** mechanism
with four vocabularies), the shadow graph, and tension and belief as objects.

## Capability disclosure

| Capability | Used |
|---|---|
| File system — write | Notes inside the Lab folder you choose |
| Network | No |
| Clipboard | No |
| Script execution | No |
| AI | No |

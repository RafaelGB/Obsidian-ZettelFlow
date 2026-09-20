# Think

*Your thinking space — where anything starts.*


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

### A thread moves as one

**Throwing away, setting aside and deciding against all act on the whole thread.** An answer
without the thought it answers is a fragment: if you discard the idea, the counterpoint you wrote
against it has nothing left to argue with, so it goes too.

The tooltip says so before you click — *takes 3 answers with it* — because a destructive action
that does not state its reach is how you lose four thoughts meaning to lose one. And the undo puts
the **whole** thread back.

What is set aside is threaded too: a thread set down together should read together.

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

There are **two** kinds of redraw, and confusing them was a real bug — an undo restored the file
and nothing on screen, because the guard below refused while the composer held the cursor:

| | |
|---|---|
| `refresh()` | for something that changed **while you write**. Refuses if a text box has focus. |
| `redrawAfterAction()` | because **you** did something. Always happens, and puts the cursor back. |

The guard exists so typing can never move the ground under you. It is not a veto on what you
asked for.

Two more rules hold it together, each stated in exactly one place:

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

## The move record (#491)

ZettelFlow records what you **have** — notes, states, links, verdicts, and every write it made on
your behalf. Since 4.3 it also records what you **did**: the operation that changed your mind.

A **move** is five things and nothing more:

| Field | What it holds |
|---|---|
| `primitive` | one of five: externalize · transform · perturb · explore · crystallize |
| `verb` | one of eleven: capture · split · compress · reframe · challenge · counterexample · invert · branch · analogy · set-aside · crystallize |
| `subject` | a vault path or a thought id — a **reference**, never content |
| `from` | the move this came out of, so a branch has a genealogy |
| `because` | one optional line, capped at 140 characters |

### What it never holds

No note body, no thought text. The subject is a reference, exactly as `Judgement.subject` is, and
the sanitiser rebuilds every entry on read so a field the type never declared cannot arrive from
disk even if something wrote one there. That is what makes the record safe enough to keep on
without asking.

### Nothing records itself

Every move comes from a gesture you made. A log a vault event could append to is not a record of
your thinking — it is telemetry, and this project [deleted its telemetry on
purpose](project-health-and-roadmap.md). The rule is enforced the way the
[write seam](reversibility.md#one-door-and-the-test-that-keeps-it-shut) is: the callers are
derived from the source, and one that also listens to a vault event fails the build.

### Bounded per subject, not by clock

The [write record](reversibility.md) expires after a week because it carries values to restore. A
move log that expired would destroy the thing it exists for, so it is bounded differently: the
most recent **50 moves per subject**, then a global ceiling of **2,000**. The order matters — a
global cap applied first would wipe the whole history of an idea you thought about once to make
room for one you thought about all week.

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

## Arriving from somewhere (#473)

Cultivate and the Lab are **not** the same thing wearing two hats, and that was argued out
carefully enough to write down:

| | Cultivate | The Lab |
|---|---|---|
| The subject | a note that exists | the thought; there is no subject yet |
| What you bring | something you already know | not knowing what you think |
| Where output lands | the note, which is how a note matures | nowhere, until you crystallize |

A counterpoint to note X is a fact *about* X, and putting it into X is `knowledge evolves`, not
premature commitment. A shared verb is not a shared capability — `delete` exists on notes and on
thoughts, and nobody calls that duplication.

What was missing was a **door**, in both directions:

- **From a note** — a command, and an item in the file menu.
- **From Cultivate** — *I do not know yet — think in the lab*, the exit for the one case that
  surface cannot serve.

The note comes across as the thread's **subject**, carried in the view state through the same
deep-link seam everything else uses. Every thought written in that visit inherits it, so an
answer you write an hour later still knows what it was about.

### Crossing writes nothing

Leaving a question unanswered is **not an edit**. A guardrail asserts the bridge reaches no
writer at all — a bridge that dirties your vault is a bridge nobody crosses twice.

### The subject is named, not shown

The thread's root says which note it is about and opens it on a click. It does not render the
note's content: that would make the Lab a reading surface, and put the note back at the centre of
a place that exists for the thought. A subject that has since been deleted says so, and the
thread is still yours.

### Going back where you came from (#474)

A thread with a subject was a one-way street: you crossed over to think, worked something out,
and the only thing crystallization knew how to do was create a *new* note — leaving the one you
came from exactly as unfinished as when you left it.

So crystallization now has two destinations, and when both are open **neither is the default**.
Where a piece of thinking belongs is the decision; guessing it is how it ends up in the wrong
place.

Going back **appends**, never rewrites:

```markdown
## From the lab

What you wrote, as you edited it.

## Born from
- "maybe the volume does not justify it"
- "or maybe it does at 10x"
```

Whatever the note already said is untouched, the write goes through the recorded seam so it can
be taken back (#454), and the verdict goes to the same log as every other — naming the note it
landed in.

If the thread's subject has since been deleted, only the new-note destination is offered, and the
reason is said. Offering to append to something that is gone is offering to fail.

A crystallization of thoughts that disagree about what they are about has **no** subject: there
is no honest single note to return to.

## Capturing lands here (#475)

The capture command used to write `Inbox/<title>.md` with `state: fleeting`. Three commitments
before you had decided anything: that it is a **note**, that it has a **title**, and that it has
a **lifecycle state**. It was immediately in the knowledge model, could be an orphan, counted in
Health, and was one more thing in an inbox to get through.

An impulse has no subject. It now leaves a **thought**.

Same command, same hotkey, same single prompt — two commands doing almost the same thing is what
subtraction refuses, and the friction was the feature. A captured thought is indistinguishable
from one typed in the Lab: there is no "captured" flavour to manage later.

With no Lab folder configured it says so and writes nothing. Falling back to creating a note is
how you end up with the thing this change exists to stop.

`QuickCaptureService` was **renamed** rather than removed: its remaining caller is inquiry (#401),
whose outcome is a frozen reviewed snapshot and is not capture. It is now `CreateOnlyWriter`,
which is the job it actually has.

## From the keyboard (#476)

Every move was a button that appears on hover. That is fine for a surface you visit; it is wrong
for the place an idea starts — reaching for the pointer mid-sentence is the same interruption as
being asked for a title, except it happens every time instead of once.

| | | | |
|---|---|---|---|
| `J` / `K` | next · previous thought | `F` | fork |
| `C` | challenge | `L` | connect |
| `X` | pick out | `Y` | crystallize what you picked |
| `S` | set aside | `Esc` | stop writing |
| `Shift+A` | decided against | `Shift+D` | throw away |

Four rules make single letters safe in a surface whose whole purpose is typing:

- **Writing wins over shortcuts, always.** Inside a text box, a letter is a letter. Only `Esc`
  gets through.
- **Nothing destructive on a bare key.** Throwing a thread away needs `Shift`, because a stray
  keystroke in a place you were told is safe must not be able to do it.
- **Scoped to the view.** A single letter that worked everywhere in Obsidian would be a bug in
  somebody else's workflow, and a modifier is left to Obsidian entirely.
- **The focused thought is visible**, not guessed — and its actions stay on screen, because you
  cannot hover what you reached with a key.

One table (`application/thinking/labKeys.ts`) is read by the handler, the tooltips and the
legend, so what a key does cannot drift from what the legend says it does. A guardrail asserts
every rendered action is wired to it: a move added later cannot be mouse-only.

## When the lab has grown (#477)

The Lab works because it asks nothing of you, which is also what makes it fill up. After a few
weeks the thread you want is below the fold, and the refuge is a wall of text.

Every obvious fix is the wrong shape. A list of what to process is an **inbox**. A count is a
**debt**. A ranking of what looks promising is a **judgement**, and it is yours (§XII).

What is actually needed is narrower: **a way to find the thing you are looking for, when you are
looking for it.**

- **A filter**, appearing only once there are enough thoughts to lose one in — a search box over
  four thoughts is furniture. Empty by default, it narrows and **never reorders**.
- **A match keeps its thread.** If an answer matches but its question does not, the question comes
  with it: an answer alone is a fragment.
- Case- and accent-insensitive, because you will not remember whether you typed *análisis* or
  *analisis* at eleven at night.
- **Folding**, so a long thread is one card when you are not in it. View state: it survives a
  redraw and **not** a restart, because nothing about how you looked at a thread belongs on disk.
- **The Lab opens where you left it.**

No saved filters — *one you keep is a queue with a different name* — no suggestions, no counts.
The guardrail from #469 is extended over all of it, and `lab.thread.500` measures a
five-hundred-thought lab in CI: **0.65 ms per keystroke**, against a ceiling of 8.

## What is not here yet

Phase 2 of [epic #465](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/465): the operator
engine (collision · constraints · perspectives · question transformations, as **one** mechanism
with four vocabularies), the shadow graph, and tension and belief as objects.

## The name, and the one in the code

The surface is called **Think** (#479). It was *Lab*, which reads as somewhere advanced you go
once you already have something to test — the opposite of an invitation to begin, and beside
`Home · Cultivate · Recent` it was the entry a new user was least likely to open first. A verb is
the invitation, and it is the only verb the ribbon menu offers.

It leads that menu, above *Create note*. That order is the claim: an idea starts as a thought, and
a note is what it may become.

**The code still says `lab`** — the classes, the `lab/` folder, `thoughtLabPath`. That is
deliberate. A product name and a code name serve different readers, `lab` remains an accurate
description of what the code is, and renaming identifiers for a label is churn with real
regression risk. The repo already does this: `historyView` serves the *Recent* mode. What matters
is that the command id and the mode id never changed, so nobody's hotkey or deep link broke.

## Capability disclosure

| Capability | Used |
|---|---|
| File system — write | Notes inside the Lab folder you choose |
| Network | No |
| Clipboard | No |
| Script execution | No |
| AI | No |

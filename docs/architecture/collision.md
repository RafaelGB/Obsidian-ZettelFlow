# Two things far apart

> Epic [#559](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/559) — the draw (#566), the
> question (#567), the verdict (#568) and the door (#569).

The [thinking space](thought-lab.md) shipped with four moves and a promise there would not be a
fifth: *collision, constraints, perspectives and question transformations belong to the operator
engine in phase 2.* This is the collision, and it is the whole of phase 2 for now — **one operator,
not a catalogue**.

The operator is the one your vault can stage without inventing anything: put two notes in front of
you that have **nothing to do with each other**, and ask what they could possibly share.

## The opposite of a gap

Everything else in the product looks for pairs that are **close**. `findDiscoveries` finds notes
that share graph context and are not linked; [#529](../development/knowledge-dashboard.md) named
them *gaps* — where your thinking almost touches and never does — and recorded two honest limits:

> 0 of 3,331 gaps cross a region […] an `alone` note can never have a gap: no neighbour, no shared
> context. **The loneliest notes get nothing from this lens.**

A collision is the reader for which those notes are the **best** material. The notes that stand
alone, and every pair living in two different neighbourhoods, are invisible to every other analysis
in the product — and they are exactly what you want when the question is *what could these two
possibly have in common?*

## How a pair is drawn

There are 4,371 pairs in a 94-note vault and about **48.7 million** at ten thousand notes, 95 % of
them collisions. So nothing is searched, ranked or listed. A pair is **drawn**, in two stages:

1. one note, uniformly;
2. the other **from a bucket that already satisfies the distance** — another community, or another
   region — so the distance costs no rejections and cannot fail to find what is there.

Only three things can reject a candidate: a **shared neighbour** (same direction, which is what
co-citation and bibliographic coupling mean), an existing **link**, and a pair you have already
**ruled out**. The heaviest projection in the product is never woken: a dice roll may not cost a
second and a half.

Measured at ten thousand notes: **0.008 ms** per draw once the neighbourhoods are known.

### How far apart

| | |
|---|---|
| **Far apart** | the two notes are in different communities |
| **As far as this vault goes** | different regions — or a note that stands alone |

It is the only difficulty dial this product has, and it is allowed to exist for one reason: it is a
fact about your graph and **you choose it**. Nothing here measures you or decides how hard you
should be working.

**Standing alone is not a neighbourhood.** Two notes that belong to nothing are not in the same
place — they are in no place, which is as far apart as a graph goes. So a vault of entirely
isolated notes still produces pairs, and *far apart* never reaches a note with no community,
because there is no community for it to differ from.

## The question, and no answer to it

Two cards — a title each, and the sentence each note [claims](../development/claim-returns.md) when
it claims one — and one question between them.

Nothing on that screen resembles an answer. No hint, no example, no generated analogy, and no AI
anywhere in the path: a locale scan refuses *for example*, *they both*, *hint* and *suggest* in both
languages, and a source scan refuses the AI door outright. This is
[§XII](../development/constitution.md) and the [#497](thought-lab.md) rule — *the system provides
the frame, you provide the content* — and here it is not a constraint but the point. If the system
could tell you what two distant notes share, there would be nothing left for you to do.

You answer in the composer that is already there. The thought that comes out carries **both** notes
as its subject, so both of their timelines say a thought was written about them — through a link
that was already in the data, retroactively, with nothing new recording it. The move
`explore · analogy` is written down when the **thought** is, never when the pair appears: a
collision you looked at is not an act of thinking.

## Three ways out, and one of them is free

| | |
|---|---|
| **Write something** | one thought, two subjects, one move |
| **Nothing here** | a verdict: this pair is not worth anyone's time. It never comes back |
| **Close it** | nothing is recorded, and the pair can come back |

Skipping and ruling out are different acts and must not look like one. The verdict is the same
shape as *not related* on a gap ([#534](../development/knowledge-dashboard.md)) — the pair
canonicalised so one pair is one entry, written to the judgement record and **never to either
note** — and the set is read where the draw happens, so a pair you ruled out is gone from the panel,
from the anchored door and from `zf.knowledge.collision` at once.

## Two doors, and no new command

- **In the thinking space**, from the header.
- **On a note**: *Make a move… → analogy*, which collides **that** note with something far away.

Nothing in the move vocabulary changed to make the second one work: `analogy` already opened the
thinking space framed about the note, and the commit path already recorded the move. There are
still eleven verbs, still no collision command, and still no fifth move in the Lab — a collision is
an **operator**, which is a different thing.

## What it never does

- **It never counts.** Not pairs offered, answered or dismissed. No streak, no daily, no quota — a
  scan over all of `src/` refuses the tally and a locale scan refuses the vocabulary, in both
  languages.
- **It never ranks.** There is no *interestingness* score: an invented metric, and the value of an
  answer is not knowable to the system.
- **It never grades your answer.** There is no right one.
- **It never reaches outside your vault.** No external corpus, no random word list, no AI-picked
  concept. Your vault is the universe, and that is the property that makes this worth doing.

## Honest limits

- **The pair is a fact about the graph and nothing more.** That these two are far apart is not a
  claim that they are related, or that they should be.
- **A small vault may have nothing far enough apart.** One community and one region means one plain
  sentence saying so — not an apology, and not an instruction to go and write more notes.
- **A pair you dismissed is gone for good.** There is no *forget this verdict* control in the panel;
  the judgement record is where it lives.
- **A pair you *answered* can come back.** Only *nothing here* is remembered, and a thought is
  outside the knowledge model by construction — so nothing about having answered removes the pair.
  Two people read this as a bug and one as a feature; it is written down rather than fixed, because
  a second answer to the same absurd pair is not obviously a mistake.

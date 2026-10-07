---
description: What you highlight in the Reader comes back a few at a time, on a fixed and growing schedule — still think so, changed your mind, or let it go. No counts, no streaks.
---

# A few things you marked

**A highlight is a judgement you made while reading: *this mattered*.** A few days later, that
judgement comes back once, in the Reader's own type, with one question: **do you still think so?**

![A few things you marked: on Home, only on a day something is due, and the review card — the passage, where you marked it, your margin note, the question and five answers with their keys](../resources/reader/review.svg)

## Where it comes from

- **Home**: the first card of **Came back today** (#704), answered right there with the same five
  answers. It is there **only on a day something you marked is due**. On other days there is no card,
  no empty box and no count.
- **Think**: one line above the composer, *A few things you marked are back for a second look*, with
  **Look again**. It follows the same rule.

Both open the same few cards, at most five. With nothing due, the cards say *Nothing you marked is
back today* and offer to close. You never see a notice about it.

## The card

The passage is set the way the [Reader](reader.md) sets it, with your font, size and theme
(sepia, light or dark included). Under it you see where you marked it (*Marked in Event sourcing ›
Events · October 2026*), your margin note if you wrote one, and the question.

| Key | Answer | What happens |
|---|---|---|
| **1** | **Still think so** | Your verdict goes to the [judgement record](cognitive-agency.md) as *confirmed*. The highlight comes back further out. |
| **2** | **Changed my mind** | A field opens. What you write becomes a new thought **linked to the highlight**, and the highlight itself is kept as it was. The old mark comes back further out too. |
| **3** | **Open in the Reader** | The review closes and the Reader opens the note at the passage. |
| **4** | **Crystallize** | Think's own crystallize opens on this highlight: the passage quoted, then your margin note, ready to edit. The note it makes **cites where you read it**. Making a note sets the highlight aside, as crystallizing in Think does. |
| **5** | **Let it go** | It never comes back. The thought stays in Think. Nothing is deleted. |

**←** and **→** move between cards without answering. **Esc** closes. The dots show where you are,
but there is no count of what is left. A key you press while writing in the field types into the
field. **Ctrl/Cmd+Enter** keeps what you wrote.

## Changed my mind: then and now

Changing your mind does not overwrite what you thought then. You get a pair:

- **In Think**, the new thought sits under the highlight, in the same thread, marked *Changed your
  mind*. It answers the highlight the way a challenge does, and neither one is marked right.
- **On the note's story** (in [This note](this-note.md)), a *Changed your mind* row shows the
  passage you marked **before**. **Now** links to what you think now, in Think. The words you wrote
  stay in Think, one click away, like every thought.

The new thought's frontmatter records what it revisits:

```yaml
zfThought:
  id: 7c1d0e42
  respondsTo: 3f2a9c1e
  respondsAs: challenge
  about: Notes/Event sourcing.md
  revisesOf: 3f2a9c1e
  revisesQuote: "stores changes, not state"
```

## Crystallize: a note that cites its source

A note crystallized from a highlight (from a card, or from Think) starts with the passage as a
quote, followed by your margin note. Under the provenance it ends with a `source::` line:

```markdown
> stores changes, not state

Like a ledger — nothing is erased, only appended.

## Born from
- "Like a ledger — nothing is erased, only appended."

source:: [[Notes/Event sourcing#Events]]
```

The link carries a **locator**: the note and the heading the passage sat under. Because of that
line, the [claim and source parser](../architecture/knowledge-model.md) counts the new note as
**sourced**: it holds a claim grounded in the note you read, so it counts as
[evidence](evidence-map.md) wherever the new note supports another one. When the thinking goes back into the same note it came
from, no source line is added, because a note does not cite itself. The `source::` line is written
outside the text you edit, so tidying the body cannot delete it by accident.

## The schedule

It is fixed, visible and the same for everyone: **3 → 7 → 21 → 60 → 180 days**, and then every 180
days for as long as you keep it.

- A new highlight is due **3 days** after you made it.
- *Still think so* and *Changed my mind* move it to the next interval, counted from the day you
  answered.
- *Let it go* retires it.
- Highlights you set aside in Think, crystallized ones included, are not shown.

The schedule does not learn anything about you. It is not memorisation and you are not graded, so no
algorithm judges how well you remembered. The same highlights on the same day always give the same
cards: the longest-waiting first, then the oldest mark. If you skip a day, nothing changes. A card
you leave is the same card tomorrow, and nothing grows into a number of things you are behind on.

## Where it is kept

In **the highlight's own file**, in Think's folder. The review is a few lines in its `zfThought`
frontmatter, next to the passage:

```yaml
zfThought:
  id: 3f2a9c1e
  about: Notes/Event sourcing.md
  quoteExact: "stores changes, not state"
  reviewStage: 1
  reviewDue: 1791763200000
  reviewedAt: 1791158400000
```

These are ordinary writes of a thought, so they land in the [write record](../architecture/reversibility.md)
and can be undone. A highlight that has never been reviewed has no review lines. Your notes are
never written to.

## How to verify

| Command | Proves |
|---|---|
| `npx jest highlightReview` | the intervals, the deterministic choice, *let it go*, the frontmatter round-trip, and the cache-only check the doors use |
| `npx jest reviewCards` | the card: the passage, the five answers and their keys, the field, the arrows, no numbers, the empty state |
| `npx jest HomeModeRenderer.structural capabilityDoors` | Home's stack is gated on something being due; the capability has a door |
| `npx jest highlightCrystallize` | the passage and margin note in the body, the `source::` citation with its locator, the note parsed as sourced, no citation back into the same note, the revision round-trip |
| `npx jest storyRevision thoughtStoreReview` | the story's *Changed your mind* row with *before* and *now*; the store reads which thought revises which passage |

By hand, in a vault with Think's folder set:

1. Open a note in the Reader, highlight a sentence and write a margin note. **Expect:** a thought in
   Think. Home shows nothing under *Came back today*.
2. In that thought's file, change `at:` to a time more than three days ago. **Expect:** Home shows
   the passage under *Came back today*, and Think shows the line above the composer.
3. Click **Look again**. **Expect:** the passage in the Reader's type, *Marked in …*, your margin
   note, *Do you still think so?* and five answers numbered 1–5.
4. Press **1**. **Expect:** the cards end with *That is all for today*. The thought's file now has
   `reviewStage: 1` and a `reviewDue` seven days out. Home's stack moves on.
5. Make it due again and press **2**, type a sentence and press **Ctrl/Cmd+Enter**. **Expect:** in
   Think, a new thought under the highlight marked *Changed your mind*. In **This note → story**, a
   *Changed your mind* row with the passage under *Before*. The highlight's own text is unchanged.
6. On another due highlight press **4** and **Create**. **Expect:** a new note that starts with the
   passage as a quote and ends with `source:: [[…#heading]]`. Hover the link: it opens the note at
   that heading. The highlight is set aside in Think.
7. Make it due again and press **5**. **Expect:** `reviewRetired: true`. It is never offered again.
8. Negative: with nothing due, open Home and Think. **Expect:** no card, no line, no notice and
   nothing written.

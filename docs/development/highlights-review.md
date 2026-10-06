---
description: What you highlight in the Reader comes back a few at a time, on a fixed and growing schedule — still think so, changed your mind, or let it go. No counts, no streaks.
---

# A few things you marked

**A highlight is a judgement you made while reading: *this mattered*.** A few days later, that
judgement comes back once, in the Reader's own type, with one question: **do you still think so?**

![A few things you marked: the Home tile that appears only on a day something is due, and the review card — the passage, where you marked it, your margin note, the question and five answers with their keys](../resources/reader/review.svg)

## Where it comes from

- **Home**: a tile, **A few things you marked**, beside the other three. It is there **only on a day
  something you marked is due**. On other days there is no tile, no empty box and no count.
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
| **2** | **Changed my mind** | A field opens. What you write becomes a thought in Think, about the same note, and the old mark comes back further out too. |
| **3** | **Open in the Reader** | The review closes and the Reader opens the note at the passage. |
| **4** | **Crystallize** | Think's own crystallize opens on this highlight. If the highlight has no note, the passage is used as the starting text. Making a note sets the highlight aside, as crystallizing in Think does. |
| **5** | **Let it go** | It never comes back. The thought stays in Think. Nothing is deleted. |

**←** and **→** move between cards without answering. **Esc** closes. The dots show where you are,
but there is no count of what is left. A key you press while writing in the field types into the
field. **Ctrl/Cmd+Enter** keeps what you wrote.

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
| `npx jest HomeModeRenderer.structural capabilityDoors` | the Home tile is gated on something being due; the capability has a door |

By hand, in a vault with Think's folder set:

1. Open a note in the Reader, highlight a sentence and write a margin note. **Expect:** a thought in
   Think. Home shows **no** *A few things you marked* tile.
2. In that thought's file, change `at:` to a time more than three days ago. **Expect:** Home shows
   the tile, and Think shows the line above the composer.
3. Click **Look again**. **Expect:** the passage in the Reader's type, *Marked in …*, your margin
   note, *Do you still think so?* and five answers numbered 1–5.
4. Press **1**. **Expect:** the cards end with *That is all for today*. The thought's file now has
   `reviewStage: 1` and a `reviewDue` seven days out. Home loses the tile.
5. Make it due again and press **2**, type a sentence and press **Ctrl/Cmd+Enter**. **Expect:** a
   new thought about the same note in Think.
6. Make it due again and press **5**. **Expect:** `reviewRetired: true`. It is never offered again.
7. Negative: with nothing due, open Home and Think. **Expect:** no tile, no line, no notice and
   nothing written.

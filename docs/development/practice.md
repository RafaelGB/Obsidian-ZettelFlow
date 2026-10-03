# Practice

**Practice** is the second mode of the **Health** surface, beside [Tend](slipbox-health-dashboard.md).
Tend asks *which notes need me*; Practice answers *what have I been doing* — as facts, never as a
grade. It merges the old **Momentum** and **Agency** modes (#645, epic #639): each was a mirror too
thin to earn a mode of its own.

![Practice: twelve weeks of ideas developed, the decisions on proposals as one bar, and the latest decisions](../resources/showcase/practice.svg)

## Opening it

- **Ribbon menu** › *Health*, then **Practice** in the mode bar.
- **Command palette** — **"Show practice"** (`show-thinking-heatmap`; the id is kept so existing
  hotkeys still work).
- A workspace saved on the old *Momentum* or *Agency* mode opens on Practice, in place.

## Ideas developed

A strip of the **last 12 weeks**, one cell per day, read from the
[development journal](thinking-heatmap.md): how many ideas you *developed* — advanced a state, added a
first source, added a connection. Each cell names its count and day; a line counts the window
(*23 ideas in the last 12 weeks*).

Twelve weeks, with no toggle for a year: enough to see a rhythm, short enough that a new vault is not
a sea of empty days, and it fits a phone without scrolling. The journal still keeps about a year, and
scripts can read it.

## Your decisions on proposals

How you answered what was proposed to you — by Cultivate, by a derived suggestion, by AI — counted
over **every recorded verdict**:

- one proportional **bar**, in three neutral tints: accepted is not green and rejected is not red;
- a legend with the three counts (*8 were accepted · 5 were changed · 3 were rejected*) and a total
  (*16 decisions on proposals*);
- one **plain sentence** describing the mix — *You changed or rejected two or more of every five
  proposals.* — with the same thresholds the [judgement record](cognitive-agency.md) has always used.
  Below five decisions it says there are not enough to read a pattern.

There is **no percentage and no index** here: a number about you is a grade, and the counts already
say it (§XII). The cognitive agency index still exists for scripts, as `zf.knowledge.agencyIndex()`.

## Recent

The **ten** latest decisions, newest first: the note (it opens on click or Enter, with the usual hover
preview), the verdict, and when. There is no *show all* — a note's full history is its
[story in This note](this-note.md). Who proposed it and how sure you were stay in the record.

## When there is nothing to show

- No development in the window: one sentence saying so, and how a day fills.
- No decision on a proposal yet: one sentence, and no empty bar.
- Judgement recording switched off: one line saying so, with **Open settings**, which opens
  ZettelFlow's settings tab (the switch is in the *Thinking* group). The strip still shows.

Practice reads; it writes nothing. It refreshes when the vault settles and every time you open it.

## Where the timings went

The **Timings from this vault** that used to sit at the bottom of Health — how long building the
index, enrichment and the heaviest analysis took on this machine — are now read-only rows in
**Settings › Advanced** (behind *Show advanced settings*), beside the log level. They are the same
numbers. The one live thing, an enrichment pass running *now* with its **Stop**, stays on Tend.

## For contributors

`practice/practiceModel.ts` is pure and locale-free: `practiceStrip(counts, now)`,
`practiceMix(history)` and `practiceRecent(history)`, composed over the unchanged State functions
`buildHeatmapGrid` and `agencyReviewModel`. `PracticeRenderer` takes its sources injected
(`dailyCounts`, `judgements`, `now`, `openSettings`), so it is tested without the plugin's
singletons. The bar is SVG geometry — one unit of width per decision — never inline style.

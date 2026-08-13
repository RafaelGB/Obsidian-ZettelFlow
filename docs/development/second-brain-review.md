# Second-brain review

The **Second-Brain Review** turns your slip-box into a weekly ritual: run one command and ZettelFlow
generates a **review note** summarizing your thinking over the last 7 days, with a next action per
section. It is a *byproduct* of the model your workflows already populate — no separate tracker.

## Running it

Run **"Generate weekly review"** from the command palette. ZettelFlow writes and opens
`_ZettelFlow/reviews/Weekly review <YYYY-MM-DD>.md` — one note per day, overwritten if you run it
again the same day. If the knowledge index is still building, it tells you to try again in a moment.

## What's in the digest

Over a rolling **7-day** window ending now, four sections (empty ones are omitted):

| Section | What it shows | Next action |
|---|---|---|
| **Ideas created this week** | notes whose `created` falls in the window | review them |
| **Orphans** | notes nothing links to | connect them |
| **Forgotten ideas** | notes untouched for ≥ 30 days (`STALE_DAYS`), oldest first (up to 10) | review them |
| **Important but unreviewed** | hubs (degree ≥ 5) that are also stale | review them |

Each note is an extensionless `[[wikilink]]`, so every item is one click from opening it.

## Honest limits

The review reads the in-memory **Knowledge Model**, which carries only `created` and `modified`
timestamps — there are **no per-edge timestamps**, so *"connections made this week"* isn't
computable and is **deferred**; *"forgotten"* and *"important-but-unreviewed"* are scoped to
`modified` recency. A weekly `review.due` event trigger and a configurable window are also deferred
follow-ups.

## Architecture

```
computeWeeklyReview(model, now, windowDays)   (pure, Obsidian-free, unit-tested)
  → { windowDays, sections: [{ key, count, paths, action }] }   composes query/queries.ts

renderWeeklyReviewMarkdown(review, labels, dateLabel)   (pure, no i18n import, unit-tested)
  → markdown with [[wikilinks]] + a "Next: …" line per section

GenerateWeeklyReviewComponent (PluginComponent)
  registers "generate-weekly-review" (no hotkey)
  guards KnowledgeIndex readiness → compute → render → FileService.writeFile (create-or-overwrite) → open
```

# ZettelFlow Home

*Open ZettelFlow, not Obsidian.* **Home** is the single front door to your knowledge system — an
IDE-style dashboard for your mind. It reads live from the model and the development journal and tells
you, in one narrative surface, where your thinking is and **what to work on next**.

## Opening it

Run **"Show home"** from the command palette, or click **Open** next to *Home* in
**Settings → ZettelFlow → Zettelkasten toolkit**. It updates automatically (debounced) as the vault
changes. *(Auto-opening Home on Obsidian launch is a planned follow-up.)*

## What it shows

- **Greeting + "you've been thinking for N days"** — the count of distinct days you developed an idea,
  from the private [development journal](thinking-heatmap.md) (#162).
- **Next session** *(the headline)* — the single most valuable note to continue, from the
  `nextSession` heuristic below. "Continue *Spring Events*".
- **New ideas** — notes created in the last 7 days, newest first.
- **Main concepts** — your best-connected notes (`degree` descending).
- **Deserves a review** — the [weekly review](weekly-review.md)'s *stale-important* section: hubs
  (`degree ≥ 5`) untouched for 30+ days. *(Genuinely stale hubs are rare — this is empty on a young
  vault, by design.)*
- **Suggested connections** — the top [morning discoveries](morning-discovery.md) (#163): unlinked
  notes that share context.

Every note is one click from opening. Home **writes nothing** and is fully **offline**.

## The "next session" heuristic

`nextSession(model)` picks the highest-**leverage** note: one that is well-connected but
under-developed, where a working session pays off most.

```
score(note) = degree × (1 − STATE_FACTOR[state])
```

The note with the maximum score wins (ties broken by path); a vault with no connected, under-developed
note (empty / all-isolated / all-evergreen) yields **no** next session. It is pure and
**deterministic** — unit-tested with exact fixtures (that's AC-2).

## Architecture

```
nextSession(model)                                (pure, Obsidian-free, unit-tested)
  → { path, reason: "develop-hub" } | null        argmax of degree·(1−STATE_FACTOR), path tie-break

buildHome(model, { thinkingDays, now })           (pure, Obsidian-free, unit-tested)
  → { thinkingDays, newIdeas, mainConcepts, reviewDue, suggestedConnections, nextSession }
  composes computeWeeklyReview (#160), findDiscoveries (#163), hubs/created, nextSession

ZettelFlowHomeView (ItemView) + HomeComponent (show-home command, no hotkey)
  reads DevelopmentJournal.dailyCounts() → thinkingDays, then buildHome(model, {thinkingDays, now})
  renders the widgets; note rows open via workspace.openLinkText; writes nothing
```

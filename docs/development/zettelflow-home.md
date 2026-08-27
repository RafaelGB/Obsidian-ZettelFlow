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
- **3D-graph teaser** *(#285)* — a one-click card ("see the shape of your thinking") that opens the
  [Graph surface → 3D mode](../architecture/surfaces.md): the eye-catching hook right where the
  first-run flow lands a new user.
- **Growth nudge** *(#285)* — when fleeting notes are waiting, "N fleeting notes ready to develop" with
  a one-click jump to the latest capture — the loop that turns quick captures into permanent notes.
  Silent when the inbox is empty. Counts `state: fleeting` notes from the model (`fleetingCount` /
  `fleetingReady` on `buildHome`).
- **New ideas** — notes created in the last 7 days, newest first.
- **Main concepts** — your best-connected notes (`degree` descending).
- **Deserves a review** — the [weekly review](weekly-review.md)'s *stale-important* section: hubs
  (`degree ≥ 5`) untouched for 30+ days. *(Genuinely stale hubs are rare — this is empty on a young
  vault, by design.)*
- **Suggested connections** — the top [morning discoveries](morning-discovery.md) (#163): unlinked
  notes that share context.

- **What to do next** *(#273)* — the top ~5 [`KnowledgeRecommendation`](../architecture/knowledge-state.md)s
  by priority (`resolve a contradiction`, `add a source`, `connect this idea`, …), each derived purely
  from the model. A row with a target note is **click-to-navigate** (opens that note); a vault-wide
  suggestion (add examples / ask questions) is an insight line with no click; when there's nothing
  actionable it shows **"you're all caught up"**. This is *navigation, not execution* — clicking never
  writes; running a recommendation's command from Home is a deferred follow-up.

Every note is one click from opening. Home **writes nothing** and is fully **offline**.

## The "next session" heuristic (now behind Cultivate)

`nextSession(model)` picks the highest-**leverage** note: one that is well-connected but
under-developed, where a working session pays off most.

```
score(note) = degree × (1 − STATE_FACTOR[state])
```

The note with the maximum score wins (ties broken by path). **As of #313 this no longer renders as a
separate Home widget** — "what to work on next" is centralized in [Cultivate](cultivate.md), whose
`selectCultivationTarget` reuses this heuristic to pick the idea you act on (and it also surfaces in
the "what to do next" recommendations as the `develop-hub` reason). The function remains pure and
**deterministic** — unit-tested with exact fixtures.

## Architecture

```
buildHome(model, { thinkingDays, now })           (pure, Obsidian-free, unit-tested)
  → { thinkingDays, newIdeas, mainConcepts, reviewDue, suggestedConnections,
      fleetingCount, fleetingReady }
  composes computeWeeklyReview (#160), findDiscoveries (#163), hubs/created

ZettelFlowHomeView (ItemView) + HomeComponent (show-home command, no hotkey)
  reads DevelopmentJournal.dailyCounts() → thinkingDays, then buildHome(model, {thinkingDays, now})
  renders the widgets; note rows open via workspace.openLinkText; writes nothing
```

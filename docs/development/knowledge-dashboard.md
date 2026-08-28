# Knowledge dashboard

A DataviewJS dashboard shows *a query with your notes*. The **Knowledge dashboard** shows the *state
of your knowledge system* — an ops console. It reads live from the knowledge model and, crucially,
**every panel proposes a recommended next action** (no dead dashboards).

> **Merged into Slip-box health (#314).** The dashboard is no longer a separate mode — its
> connectivity and "today" panels are folded into the **[Health](slipbox-health-dashboard.md)** mode
> (Health surface), alongside the debt drill-down, balance and orphan/dead-end lists. One home for
> "the state of your system." The `Show knowledge dashboard` command still exists as an alias that
> opens Health.

## Opening it

Open the **Health** surface (ribbon → *Health*, or the retained **"Show knowledge dashboard"**
command). It updates automatically (debounced) as the vault changes.

## The three panels

Everything is a **composition** of existing State-layer functions — the dashboard invents no metric.

### Connectivity
- **Connected** — notes with at least one edge (`degree ≥ 1`).
- **Orphaned** — fully isolated notes (`degree === 0`). *(Distinct from the "no incoming" primitive.)*
- **Unresolved** — notes with a dangling outgoing link (its target isn't in the vault).
- Each is shown as a count and a % of the vault. **Recommendation:** connect the orphaned notes (opens the [slip-box health](slipbox-health-dashboard.md) pane), or "everything is connected".

### Knowledge debt
- The **Knowledge Debt** score (0–100) and its severity band (low / medium / high), from the #159
  [debt engine](slipbox-health-dashboard.md). **Recommendation:** reduce debt (opens the health pane), or "no debt — clean".

### Today
- **To process** — `fleeting` notes awaiting processing.
- **Contradictions** — `contradicts` edges to resolve.
- **Connections to make** — the top [morning discoveries](morning-discovery.md) (#163).
- **Open questions** — unanswered questions across the vault (#167).
- **Recommendation:** the single most-pressing of these (priority: contradictions → questions → to-process → connections), opening the matching pane; or "all clear".

## Every panel recommends

The pure aggregate `buildKnowledgeDashboard(model)` returns panels where **each panel structurally
carries a recommendation** (a token + the count it concerns), so a dead panel is impossible. The view
maps each recommendation token to the surface where you act on it — the evidence map, open questions,
morning discoveries, or slip-box health.

## DataviewJS interop

This ships as a native sidebar view; the existing DataviewJS (`dv`) interop is untouched. Exposing a
read-only `zf.dashboard()` to DataviewJS (so you can embed these metrics in a note) is a planned
follow-up — the pure aggregate is already the single source.

## Architecture

```
buildKnowledgeDashboard(model)                    (pure, Obsidian-free, unit-tested)
  → { panels: [{ key, metrics, recommendation }] }   composes debt (#159), discoveries (#163),
                                                       openQuestions (#167), byState, edgesByType
KnowledgeDashboardView (ItemView) + KnowledgeDashboardComponent (show-knowledge-dashboard, no hotkey)
  reads the KnowledgeIndex model → buildKnowledgeDashboard; renders 3 panels
  each recommendation row opens its target view via activateSidebarView; writes nothing
```

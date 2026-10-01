# Base dashboards

> **Status:** early access (epic #622). The dashboard view and its charts are being built slice by
> slice; this page grows with them. The full walkthrough — including the *Daily tracking* example —
> lands with S7 (#629).

**Base dashboards** turn an [Obsidian Base](https://help.obsidian.md/bases) into a datasource you
can *visualise*: one Base, many **panels** (stat, bar, line, scatter, calendar, …) over the same
filtered result. It is a local "Grafana for your vault" — no backend, nothing leaves Obsidian.

It is distinct from the [knowledge dashboard](knowledge-dashboard.md), which reports on the *idea
graph*. Base dashboards chart the **metadata** of whatever notes a Base selects.

## What ships today (S1)

Open any `.base`, add a view, and choose **Dashboard**. With no panels configured yet, the view
shows a **field inspector**: every property the Base exposes, the type ZettelFlow inferred for it
(date, number, category, boolean, link), and the current row count. Change the Base's filters and
the inspector reconciles live.

Types are inferred from Obsidian's own typed values — not guessed from raw text — so a date reads
as a date and a link reads as a link.

## Panels (S2)

Use **Add panel** to place a panel over the same filtered Base. Two types ship first:

- **Stat** — one number from a numeric field (sum, average, minimum, maximum, or a row count).
- **Bar** — a category or date on the x-axis and one or more numeric series.

Pick the type and map its fields in the panel dialog; ZettelFlow suggests a working mapping from the
inferred schema, so a panel renders immediately and you adjust from there. Charts take their colours
from your Obsidian theme and re-paint when you switch light/dark. Panels are saved in the Base's view
config — nothing is written to your notes.

## How it reads the Base

- The **Base owns the query**: filters, formulas, properties, sort and grouping are configured in
  the Base itself — ZettelFlow never builds a parallel query engine.
- ZettelFlow reads the already-filtered result and normalises it once into a shared, in-memory data
  model that every panel will read. Nothing is written back to your notes — a dashboard is
  read-only.

## Roadmap

| Slice | Brings |
|---|---|
| S2 | the first panels (stat, bar) + theme-aware charts |
| S3 | a drag/resize multi-panel layout |
| S4 | the chart catalogue (line, area, scatter, bubble, donut, table, heatmap, calendar) |
| S5 | visual transforms (filter, group, aggregate, …) |
| S6 | an optional, sandboxed script transformer |
| S7 | the *Daily tracking* example and this page, in full |

See issue #622 for the epic.

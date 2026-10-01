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

Each panel's header carries **move** (left/right) and **resize** (cycle its width across the grid)
controls; the arrangement is saved with the Base and reflows to a single column on a narrow pane or
on mobile.

The type dropdown offers **stat, bar, line, area, scatter, bubble, pie, donut, table, heatmap** and a
**calendar** heatmap. Bubble maps size and colour to extra numeric fields; the calendar reuses
ZettelFlow's own day-grid, so a date field plus an optional value lights up a contribution-style
calendar. (Treemap, radar and sankey are intentionally left for later.)

## Transforms (S5)

Each panel can reshape its data with a small pipeline of **transforms**, applied in order before the
chart is drawn: **filter, sort, group by, aggregate, bin, calculate, normalize, moving average** and
**cumulative**. A calculated, binned or averaged field is **virtual** — it exists only for the render
and is never written back to your notes.

The three levels, lowest first: (1) **Base formulas** (the native, preferred way to derive a value);
(2) these **visual transforms**; (3) the **script transformer** (an advanced escape hatch). Reach for
the lowest level that answers your question.

## Script transformer (S6, advanced)

For the rare shape the visual transforms cannot express, a panel can run a small **JavaScript**
transformer: a `rows => rows` function over plain value rows (`{ fieldId: value }`). It is **off by
default** and, when enabled, shows a warning — because it executes code you provide.

The sandbox is deliberately tiny: the script receives **only the rows**. It is given no access to
your vault, the filesystem, the network, or the app — and its output is used only to draw the panel,
never written back to a note. A script that throws or returns the wrong shape fails safe: the panel
shows the error and the rest of the dashboard keeps working.

> **Capability — script execution.** Enabling this runs user-provided JavaScript. It is opt-in per
> panel and routes through ZettelFlow's single function-constructor home, the same one the Script
> action and vault hooks use.

```js
// Example: a productivity score the Base doesn't store.
return rows.map(r => ({ ...r, score: r.realWorkingHours / r.expectedHours }));
```

## Daily tracking (worked example)

This reproduces a common journaling dashboard — the kind people build today with `dataviewjs` — as
**pure configuration**. Start from this Base ([`daily-tracking.base`](../examples/daily-tracking.base)),
point the folder filter at your own journal, open the **Dashboard** view, and add four panels:

1. **Stat** — *Working hours*: value `realWorkingHours`, aggregate **average**.
2. **Stat** — *Mood*: value `dayFeeling`, aggregate **average**.
3. **Bubble** — *Productivity*: x a date field, y `realWorkingHours`, size `productivitySize`, colour `realWorkingHours`.
4. **Bar** — *Focus & mood*: category the date, series `focusLevel` and `dayFeeling`.

Every panel is built from the dialog, not by hand-editing YAML — the `.base` is just a starting point
you copy. Change the Base's filter from the last 45 days to the last 90 and every panel follows, with
no `dataviewjs` to rewrite.

```yaml
filters:
  and:
    - 'file.inFolder("Journal")'
    - 'file.name != "readme"'
formulas:
  productivitySize: 'if(goalsAchieved, 3, 1) + file.tasks.completed.length'
views:
  - type: zettelflow-dashboard
    name: Daily dashboard
```

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

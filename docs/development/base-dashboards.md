# Base dashboards

**Point an [Obsidian Base](https://help.obsidian.md/bases) at a folder and ZettelFlow turns it into a
dashboard** — a local "Grafana for your vault". One Base is the datasource; you compose many
**panels** over the same filtered result. The unit is the *panel*, not the chart: stat, bar, line,
area, scatter, bubble, pie, donut, table, heatmap and a contribution-style calendar, all reading one
shared, in-memory projection of your notes. No backend, nothing leaves Obsidian, and **nothing is
written back to your notes** — a dashboard is read-only.

It is distinct from the [knowledge dashboard](knowledge-dashboard.md), which reports on the *idea
graph*. Base dashboards chart the **metadata** of whatever notes a Base selects — daily working
hours, mood, habits, reading, sleep — the things you used to chart with hand-written `dataviewjs`.

## Open one

Open any `.base`, click **＋ Add view**, and choose **Dashboard**. With no panels yet, the view shows
a **field inspector**: every property the Base exposes, the type ZettelFlow inferred for it (date,
number, category, boolean, link) and the current row count. Edit the Base's filters and it reconciles
live. Types come from Obsidian's own typed values — not guessed from raw text — so a date reads as a
date and a link as a link.

## Panels

**Add panel** places a panel over the same filtered Base. Pick a type, map its fields in the dialog —
ZettelFlow suggests a working mapping from the inferred schema, so it renders immediately and you
adjust from there. Charts take their colours from your Obsidian theme and **re-paint when you switch
light/dark**. Panels (and their layout) are saved in the Base's view config.

| Panel | What it draws |
|---|---|
| **Stat** | one number from a numeric field — sum, average, min, max, or a row count |
| **Bar / Line / Area** | a category or date on the x-axis, one or more numeric series |
| **Scatter / Bubble** | x vs y; a bubble adds *size* and *colour* from extra numeric fields |
| **Pie / Donut** | a share by category |
| **Table** | the mapped columns, sortable, rendered read-only |
| **Heatmap** | a category × category grid, coloured by a value |
| **Calendar** | a contribution-style day grid from a date field (+ optional value) |

Each panel's header carries **move** (left/right) and **resize** (cycle its width) controls; the grid
reflows to a single column on a narrow pane or on mobile. The bubble reproduces a date × hours chart
sized and coloured by two more fields; the calendar reuses ZettelFlow's own day-grid. (Treemap, radar
and sankey are intentionally left for later.)

## Transform the data

Each panel can reshape its data with a small pipeline of **transforms**, applied in order before the
chart is drawn: **filter, sort, group by, aggregate, bin, calculate, normalize, moving average** and
**cumulative**. A calculated, binned or averaged field is **virtual** — it exists only for the render
and is never written back to your notes.

Three levels, lowest first — reach for the lowest that answers your question:

1. **Base formulas** — the native, preferred way to derive a value.
2. **Visual transforms** — the no-code pipeline above.
3. **Computed fields** — a dashboard-level `rows => rows` in the JS editor, given `rows` + a read-only `zf` (below).

## Computed fields (advanced)

For the rare value the visual transforms cannot express, define a **computed field**: a small
`rows => rows` JavaScript, authored once at the **dashboard level** in the plugin's own editor (with
completions and hover for the API). Every column it adds becomes a first-class field that appears in
**every** panel's picker. It is **off by default** and shows a warning when enabled, because it runs
code you provide.

The sandbox is deliberately small and **offline**: the script is handed **only the rows** and a
**read-only `zf`** — `zf.knowledge` plus vault reads. It gets no `app`, makes no vault write and
reaches no network (so it never auto-calls AI — a computed field resolves automatically, and AI never
auto-fires in an automation). Its output enriches the shared snapshot **in memory only**, never a
note. Resolution runs **off the render path** and is cached per data signature; a script that throws
or returns the wrong shape fails safe — the panels keep the un-enriched data and an inline message
names the error.

> **Capability — script execution, no network.** Enabling this runs user-provided JavaScript, opt-in,
> through ZettelFlow's single function-constructor home (the same one the Script action and vault
> hooks use); every run is recorded in the [script run log](script-workbench.md).

```js
// A productivity score the Base doesn't store — add it once, chart it in any panel.
return rows.map(r => ({ ...r, score: r.realWorkingHours / r.expectedHours }));
```

## Worked example — daily tracking

This rebuilds a journaling dashboard — the kind people wire up with `dataviewjs` today — as **pure
configuration**. Start from [`daily-tracking.base`](../examples/daily-tracking.base), point the folder
filter at your own journal, open the **Dashboard** view, and add four panels:

1. **Stat** — *Working hours*: value `realWorkingHours`, aggregate **average**.
2. **Stat** — *Mood*: value `dayFeeling`, aggregate **average**.
3. **Bubble** — *Productivity*: x a date field, y `realWorkingHours`, size `productivitySize`, colour `realWorkingHours`.
4. **Bar** — *Focus & mood*: category the date, series `focusLevel` and `dayFeeling`.

Change the Base's filter from the last 45 days to the last 90 and every panel follows — no
`dataviewjs` to rewrite.

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

- The **Base owns the query**: filters, formulas, properties, sort and grouping are configured in the
  Base itself — ZettelFlow never builds a parallel query engine.
- ZettelFlow reads the already-filtered result and normalises it **once** into a shared, in-memory
  model every panel reads; it updates in place on each change and stays fast on vaults of thousands of
  notes. Read-only throughout.

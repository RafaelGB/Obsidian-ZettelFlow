# Performance budgets

Before 3.6 there was **one** `performance.now()` in the whole plugin and **no** budget, benchmark
or timing anywhere in the tests. Every statement about ZettelFlow's speed — including the ones in
the epic that created this page — was an opinion.

You cannot fix what you cannot measure, and you cannot keep it fixed without a gate. So there is
one instrument, a synthetic vault big enough to matter, and a set of budgets that **fail the
build**.

## The three pieces

| Piece | Where | What it is |
|---|---|---|
| The instrument | `src/architecture/monitoring/measure.ts` | `measure(name, fn)` / `measureAsync`, a bounded ring of samples, no I/O |
| The vault | `test/perf/generateVault.ts` | deterministic `IdeaSnapshot`s at any size, seeded, no `Math.random`, no clock |
| The budgets | `test/perf/budgets.ts` | every ceiling, with its reason and the number it was measured at |

The app and the budget suite use the **same** instrument, so the timings shown in Health are
literally the ones CI asserts.

## Running them

```bash
npm run test:perf     # the budget suite, --runInBand, --expose-gc
npm run verify        # unchanged, and still fast — the budgets are NOT in it
```

They are a separate CI job (`performance`) for one reason: they build vaults of fifty thousand
notes, and a slow loop is a loop people stop running.

`--runInBand` is not optional. Parallel jest workers compete for the same cores, which turns every
timing into a measurement of the other workers.

## What a budget is

A **ceiling with a reason**, never a record of the fastest run anyone has seen:

```ts
"analysis.discovery.10k": {
    name: "find discoveries over 10,000 notes",
    limit: 5_000,
    measured: "1,528 ms",
    because: "a hundred times every other projection and re-run on every render …",
},
```

Every budget must be able to answer *why that number*. They sit roughly 3–5× above the measured
baseline, because the gate exists to catch a change in **shape** — an accidental O(n²), a cache
that stopped caching — not a three-percent drift on a noisy runner. A budget sitting on its own
measurement turns every build red and teaches the team to ignore the gate.

Exceeding one prints the overshoot and the reason:

```
analysis.discovery.10k — find discoveries over 10,000 notes: 9000.000 / 5000 (OVER by 80%)
```

### One budget is a ratio, not a time

`analysis.discovery.scaling` asserts how the cost grows when the vault **doubles** (20k ÷ 10k).
Pairwise work that slipped to quadratic would still pass the 10k ceiling and be unusable at 50k.
The shape is the thing worth guarding.

## The baseline, and the surprise in it

Measured 2026-09-18 on the reference machine (Node 22):

| Budget | Measured | Ceiling |
|---|---|---|
| `index.build.1k` | 2.8 ms | 30 |
| `index.build.10k` | 21.8 ms | 150 |
| `index.build.50k` | **103 ms** | 600 |
| `derive.one` | 0.003 ms | 0.05 |
| `enrich.parse.50k` | 37.8 ms | 250 |
| `analysis.map.10k` | 13.9 ms | 120 |
| `analysis.debt.10k` | 5.1 ms | 60 |
| `analysis.discovery.10k` | **1,528 ms** | 5,000 |
| `analysis.discovery.scaling` | 2.24× | 3.5 |
| `model.memory.50k` | 44.9 MB | 150 |

Two of these changed what the rest of the epic should do, and they are recorded here rather than
smoothed over:

- **The model layer is fast.** Fifty thousand notes derive and index in about a tenth of a second,
  and cost 45 MB. "Deriving the whole vault on load" was assumed to be the cold-start problem; on
  this evidence it is not.
- **Discovery is the cost.** One projection is a hundred times heavier than every other, and it is
  recomputed on every surface render. That makes *computing once per revision* the highest-value
  change in the epic, not a nicety.

## What the budgets have changed so far

| Change | Measured effect |
|---|---|
| [#458 compute once per revision](../architecture/knowledge-state.md#computed-once-per-revision-458) | a second render of an unchanged 10k model: **1,413 ms → 0.073 ms** |

## What these numbers do not include

Everything above is the **pure model layer**: snapshots in, ideas and projections out. That is what
makes the harness possible without Obsidian, a DOM or files on disk — and it is a real limit.

Not measured here: `getMarkdownFiles`, the metadata cache, and the fifty thousand `cachedRead`
calls the enrichment pass makes. `enrich.parse` times the parsing; the **reading** is the expensive
half, and it is I/O no synthetic harness can honestly stand in for.

That gap is why the epic also reports real, in-app timings on the Health surface — the numbers from
*your* vault, on *your* machine, out of the same instrument.

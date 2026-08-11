# Calculate maturity action

🧠 A **Knowledge** action (#153). Scores how developed a note is on a deterministic **0–100** scale
from four graph-local signals. Offline; reads the in-memory
[knowledge model](../architecture/knowledge-model.md).

## The formula

```
maturity = state·40 + connectivity·30 + sources·15 + recency·15    (weights sum to 100)
```

Each factor is 0..1:

| Factor | How it's computed |
|---|---|
| **state** | the note's lifecycle state (#146): fleeting 0.0 · literature 0.3 · developing 0.5 · permanent 0.8 · evergreen 1.0 · **archived 0.6** (deliberately mid, not top) |
| **connectivity** | `min(degree, 10) / 10` — in+out links (#145) |
| **sources** | `1` if the note cites any source (#148), else `0` |
| **recency** | `min(ageDays, 180) / 180` — an older, seasoned note scores higher |

The result is rounded and clamped to `[0, 100]`. The weights (`MATURITY_WEIGHTS`) live in one
documented constant and are unit-tested at the boundaries.

This action is the **feed** for the Knowledge State maturity score (#158), which owns the
aggregate/persistence/dashboard — #153 only computes and (optionally) writes the per-note number.

## Options

- **Result property** — where the 0–100 number is written (default `maturity`).
- **Write to** — `Frontmatter` or `Context` (also always exposed as `{{property}}`).
- **Target note (optional)** — the note to score; empty ⇒ the note being built.

If the index isn't ready or the note isn't indexed, the action safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

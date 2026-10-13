# Calculate maturity

Score how developed the note is (0–100) from its state, links, sources and age.

*Called `calculate-maturity` in the step's YAML.*

A **Knowledge** action. It asks nothing in the wizard. Offline; it reads the in-memory
[knowledge model](../architecture/knowledge-model.md).

## Settings

- **Result property** — where the 0–100 number is written. Default: `maturity`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use it as `{{<result property>}}`, e.g.
  `{{maturity}}`.
- **Target note (optional)** — the note to score. Empty uses the note being built.

## What it writes

```yaml
---
maturity: 62
---
```

If the index isn't ready or the note isn't indexed, the action does nothing.

## The formula

```
maturity = state·40 + connectivity·30 + sources·15 + recency·15    (weights sum to 100)
```

Each factor is 0..1:

| Factor | How it's computed |
|---|---|
| **state** | the note's lifecycle state: fleeting 0.0 · literature 0.3 · developing 0.5 · permanent 0.8 · evergreen 1.0 · **archived 0.6** (deliberately mid, not top) |
| **connectivity** | `min(degree, 10) / 10` — links in and out |
| **sources** | `1` if the note cites any source, else `0` |
| **recency** | `min(ageDays, 180) / 180` — an older, seasoned note scores higher |

The result is rounded and clamped to `[0, 100]`. This action computes the per-note number; the
Knowledge State maturity score aggregates it.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**

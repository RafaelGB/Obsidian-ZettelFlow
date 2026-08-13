# Detect orphan action

🧠 A **Knowledge** action (#153). Flags whether a note is an **orphan** — it has no incoming *and*
no outgoing links (the model's `isolated` tier). Deterministic and offline; it reads the in-memory
[knowledge model](../architecture/knowledge-model.md), never the network.

## Options

- **Result property** — the frontmatter property (or context key) the boolean result is written to
  (default `orphan`). Configurable — no lock-in.
- **Write to** — `Frontmatter` (a property on the note) or `Context` (a `{{key}}` value for later
  steps). The result is always also exposed as `{{property}}` context.
- **Target note (optional)** — the note to analyze; leave empty to use the note being built.

## Result

`true` when the target note is an orphan, `false` otherwise. If the knowledge index isn't ready yet,
or the target note isn't indexed (e.g. a brand-new note that hasn't been written), the action safely
**does nothing** (logged at debug) — it never blocks the workflow.

## Where it fits

Usable in the note-builder wizard and in [event-driven workflows](../architecture/event-driven-workflows.md)
(#150). Its output feeds the Knowledge State layer (#158–#161).

## Capabilities

File-system read (the model) + the disclosed result-property write. **No network, no AI.**

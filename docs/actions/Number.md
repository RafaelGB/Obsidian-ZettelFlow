# Ask for a number

A number field. The answer is written to the note.

*Called `number` in the step's YAML.*

## Settings

- **Where it writes** — **Properties** (a property on the note), **Body** (replaces `{{key}}` in the
  step's note body) or **Context only** (not written to the note; the next steps can use it as
  `{{key}}`). Default: **Properties**.
- **Property key** — the property the answer is saved under, e.g. `pages`.
- **Question** — what the wizard asks, above the number. Empty by default.
- **Placeholder** — the grey hint inside the empty field. Empty by default.
- **Always the same answer** — skip the question and write a fixed value. Off by default.
- **Fixed value** — the number written every time. Shown only when **Always the same answer** is on.

## What it writes

With **Property key** `pages` and **Properties**:

```yaml
---
pages: 320
---
```

The value is saved as a number, not as text.

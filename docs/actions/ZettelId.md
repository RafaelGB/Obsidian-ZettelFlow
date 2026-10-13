# Note ID

Assigns a unique Zettel ID at note-creation time.

*Called `zettel-id` in the step's YAML; older docs call it the Zettel ID action.*

It runs without asking anything in the wizard. Two ways to build the ID: **Timestamp** (a sortable
date-time string) and **Folgezettel** (a branching address that places the note in a sequence
relative to a parent, following Luhmann's numbering).

## Settings

| Setting | Default | What it does |
|---|---|---|
| **ID strategy** | `Timestamp` | How the ID is computed: **Timestamp** or **Folgezettel**. |
| **Frontmatter key** | `id` | The property the ID is stored under. |
| **Write to frontmatter** | On | Save the ID under the frontmatter key. |
| **Prefix filename with ID** | Off | Put the ID in front of the note's file name (`<id> <title>`). |
| **Timestamp format** | `YYYYMMDDHHmm` | Moment.js format. Shown only with **Timestamp**. |
| **Parent ID** | *(empty)* | The existing ID to branch from. Shown only with **Folgezettel**. |
| **Relationship** | `Child` | **Child** or **Sibling** of the parent. Shown only with **Folgezettel**. |

Keep at least one of **Write to frontmatter** or **Prefix filename with ID** on, or the ID is only
available as `{{id}}` to the next steps.

## What it writes

```yaml
---
id: 202610131430
---
```

The ID is also available as `{{<frontmatter key>}}` — `{{id}}` by default — in the step's note body:

```markdown
# {{title}}

ID: {{id}}
```

## Timestamp

Builds the ID from the time the note is created, with the **Timestamp format**. The default
`YYYYMMDDHHmm` gives `202610131430`. Tokens: `YYYY` (year), `MM` (month), `DD` (day), `HH` (24-hour),
`mm` (minutes), `ss` (seconds).

## Folgezettel

Builds the ID from the **Parent ID**.

- IDs alternate number and letter segments: `21` → `21a` → `21a1` → `21a1a`.
- **Child** adds a new segment: `a` after a number, `1` after a letter.
- **Sibling** increments the last segment: `21` → `22`, `21a` → `21b`, `21a1` → `21a2`.
- A letter segment past `z` carries over: `z` → `aa`, `az` → `ba`, `zz` → `aaa`.

If the ID is already taken by another note (same **Frontmatter key**), the next free one is used and
a notice says so. With **Parent ID** empty, the next free top-level number (`1`, `2`, `3`, …) is used,
with the notice *"No Folgezettel parent selected — using next free top-level ID."*

## Not covered

Re-numbering existing notes, changing IDs when notes are renamed or moved, other ID grammars, and
uniqueness across vaults.

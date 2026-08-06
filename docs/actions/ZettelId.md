# Zettel ID action

Assigns a **unique identifier** to the note being created by a flow. Supports two strategies:
**Timestamp** (a sortable date-time string) and **Folgezettel** (a branching address that
expresses the note's position in a sequence relative to a parent, following Luhmann's
numbering scheme).

## Settings overview

| Setting | Default | Description |
|---|---|---|
| Strategy | `Timestamp` | How the ID is computed. |
| Frontmatter key | `id` | Property name written to the note's frontmatter. |
| Write to frontmatter | On | Save the ID under the frontmatter key. |
| Prefix filename with ID | Off | Prepend the ID to the note filename (`<id> <title>`). |
| Timestamp format | `YYYYMMDDHHmm` | Format string (Moment.js). Timestamp strategy only. |
| Parent ID | *(blank)* | The existing Zettel ID to branch from. Folgezettel only. |
| Relationship | `Child` | Branch as a child or sibling. Folgezettel only. |

At least one write target (frontmatter or filename) should be active.

---

## Timestamp strategy

Generates a sortable timestamp ID at note-creation time using the configured format string.

**Default format:** `YYYYMMDDHHmm`  
**Example output:** `202608051430`

The format follows Moment.js tokens: `YYYY` (year), `MM` (month), `DD` (day), `HH` (24-hour),
`mm` (minutes), `ss` (seconds).

---

## Folgezettel strategy

Computes a branching identifier relative to a **parent ID**.

### ID grammar

- IDs consist of **alternating segments**: numeric segments are followed by alpha segments and
  vice-versa.  
  Example chain: `21` → `21a` → `21a1` → `21a1a`
- **Child** relationship — appends a new segment of the alternate type, starting at its first
  value (`a` after a numeric segment, `1` after an alpha segment).
- **Sibling** relationship — increments the last segment of the parent ID.  
  `21` → `22`, `21a` → `21b`, `21a1` → `21a2`

### Alpha segment rollover

When incrementing an alphabetic segment beyond `z`, the action uses a simple carry scheme:

| Input | Output |
|---|---|
| `z` | `aa` |
| `az` | `ba` |
| `zz` | `aaa` |

### Collision detection

Before returning the computed ID, the action gathers a **single snapshot** of all existing
values for the configured frontmatter key from the vault's metadata cache. If the first
candidate is already taken, it advances to the next free candidate of the same relationship
and emits a notice.

### No parent selected (fallback)

If the parent field is left blank, the action falls back to the **next free top-level numeric
ID** (`1`, `2`, `3`, …) and shows a notice:
> "No Folgezettel parent selected — using next free top-level ID."

---

## Token substitution

The generated ID is available as `{{<key>}}` (default `{{id}}`) in the note's body and
frontmatter templates, consistent with how other action results are substituted.

**Example template body:**

```markdown
---
id: {{id}}
---

# {{title}}

Parent: {{id}}
```

---

## Observability

- On every successful execution a `log.debug` entry records the strategy and the generated ID.
- A `Notice` fires when:
  - No parent was selected (Folgezettel fallback to top-level).
  - A collision forced the candidate past the first free value.

---

## Out of scope

- Re-numbering or back-filling existing notes.
- Migrating IDs when notes are renamed or moved.
- Custom ID grammars beyond Timestamp and Folgezettel.
- Cross-vault uniqueness.

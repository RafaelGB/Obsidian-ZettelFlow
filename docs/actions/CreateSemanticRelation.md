# Create semantic relation

Write a typed relation (supports, contradicts, …) from this note to a target note.

*Called `create-semantic-relation` in the step's YAML.*

A **Relations** action. It asks nothing in the wizard. The relation is stored as a property whose
**key is the relation type** — e.g. `supports: "[[Target]]"` — which the
[knowledge model](../architecture/knowledge-model.md) reads as a typed link on its next re-index.
Deterministic and offline.

## Settings

- **Relation type** — the relation written to the note's frontmatter: **Supports**, **Contradicts**,
  **Expands**, **Inspired by**, **Question**, **Example** or **Implements**. Default: **Supports**.
- **Target note** — the note this relation points to, written as a `[[wikilink]]` (without `.md`).
  Empty writes nothing.
- **Write to** — **Frontmatter** (recommended — the vault picks it up promptly) or **Context** (only
  for the next steps). Default: **Frontmatter**.

## What it writes

One property; its key is the relation type in lower case, with a hyphen for *Inspired by*:

| Relation type | Property key |
|---|---|
| Supports | `supports` |
| Contradicts | `contradicts` |
| Expands | `expands` |
| Inspired by | `inspired-by` |
| Question | `question` |
| Example | `example` |
| Implements | `implements` |

```yaml
---
supports: "[[Target]]"
---
```

The next steps can use it as `{{<property key>}}`, e.g. `{{supports}}`. Plain `[[links]]` in the
body stay untyped links — this action is for the *typed* ones.

## Interactive only

The target is fixed in the action's own settings, so it is meant for flows you run by hand. In a
shared `.zftemplate` system's `onCreation` it does nothing — a template can't know each note's
target. In a system, ask for the link with [Ask for text](Prompt.md) (a `[[wikilink]]` answer) or
use [Find related](FindRelated.md) / [Suggest link](SuggestLink.md).

## Removing a relation

Run the **Remove a relation** command with the note open. It lists the note's typed relations and,
after a confirmation naming the exact link (`type → [[target]]`), removes the one you pick from the
note's properties — deleting the key when its last value goes. Offline, no AI. Links written in the
body are not covered.

## Capabilities

File-system write of a single typed frontmatter field (the same surface as every action). **No
network, no AI.**

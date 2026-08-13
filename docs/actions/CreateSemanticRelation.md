# Create semantic relation action

🔗 A **Relations** action (#154). Writes a **typed** relation from the note being built to a target
note, using the [#147 semantic vocabulary](../architecture/knowledge-model.md). The relation is
stored as a **frontmatter field whose key is the relation type** — e.g. `supports: "[[Target]]"` —
which the [knowledge model](../architecture/knowledge-model.md) (#145) then indexes as a directed,
typed edge on its next re-index. Deterministic and offline.

## Relation types

The fixed semantic vocabulary: **supports · contradicts · expands · inspired by · question ·
example · implements**. (Plain `[[links]]` remain the untyped `link` fallback — this action is for
the *typed* ones.)

## Options

- **Relation type** — the semantic relation to write (the key of the frontmatter field).
- **Target note** — the note this relation points to; written as an extensionless `[[wikilink]]`.
  An empty target, or a type outside the vocabulary, is a **safe no-op** (nothing is written).
- **Write to** — `Frontmatter` (recommended — indexed promptly by the metadata cache) or `Context`.

## Result

One typed frontmatter field, e.g. `supports: "[[Target]]"`, also exposed as `{{supports}}`. Feeding
that field through the relation schema yields exactly one `Relation { type, from: note, to: target }`.

## Removing a relation (#181)

To delete a relation you created, run the **Remove a relation** command (command palette) with the
note active. It lists the note's typed relations, and after a **confirmation naming the exact edge**
(`type → [[target]]`) removes the one you pick from the note's frontmatter — deleting the key when its
last value goes. A missing edge is a safe no-op. It is a command (not a wizard action) because it is
the only *destructive* relation operation and mutates a pre-existing note; the confirmation is its
safety guard. Offline, no AI. v1 handles typed frontmatter relations (inline body `[[links]]` are out
of scope).

## Capabilities

File-system write of a single typed frontmatter field (the same surface as every action). **No
network, no AI.**

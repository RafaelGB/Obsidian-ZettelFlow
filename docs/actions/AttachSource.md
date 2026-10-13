# Attach source

Attach a source (wikilink or free text) to the note being built.

*Called `attach-source` in the step's YAML.*

A **Research** action. It asks nothing in the wizard. The source is written under the `source`
property, so the [knowledge model](../architecture/knowledge-model.md) counts the note as sourced on
its next re-index. Deterministic and offline.

## Settings

- **Source** — a `[[wikilink]]` to a note, or free text (URL, DOI, citation). Empty writes nothing.
- **Write to** — **Frontmatter** (recommended — the vault picks it up promptly) or **Context** (only
  for the next steps). Default: **Frontmatter**.

## What it writes

```yaml
---
source: "[[Make it stick]]"
---
```

A notice confirms it. The next steps can use it as `{{source}}`. It only writes the note being built,
never another note.

This action is not the only way to write a source: the [claim door](../development/claim-returns.md)
offers it as an optional second line, and Cultivate's *add a source* move writes it too. All three
write the field the same way, so a note that already has several sources keeps them.

## Interactive only

The source is fixed in the action's own settings, so it is meant for flows you run by hand. In a
shared `.zftemplate` system's `onCreation` it does nothing — a template can't know each note's
source. In a system, ask for it with [Ask for text](Prompt.md), or suggest candidates with
[Find sources](FindSources.md). See the
[Systems Gallery authoring guide](../how-to-contribute/systems-gallery.md).

## Capabilities

File-system write of a single `source` frontmatter field on the note being built (the same surface
as every action). **No network, no AI.**

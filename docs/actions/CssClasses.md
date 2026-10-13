# Add CSS classes

Lets you pick CSS classes for the new note.

*Called `cssclasses` in the step's YAML.*

Obsidian styles a single note through its `cssclasses` property (for example with a CSS snippet).
This action writes that property, from what you pick in the wizard or from a fixed list.

## Settings

- **Always the same answer** — skip the question and write a fixed value. Off by default.
- **Fixed value** — the classes written every time: search the classes your notes already use, or
  type a new one to create it. Shown only when **Always the same answer** is on.

## What it writes

```yaml
---
cssclasses:
  - wide-page
---
```

## In the wizard

A multi-select of the CSS classes your notes already use; type to create a new one.

# Run a script

Runs your JavaScript while the note is built.

*Called `script` in the step's YAML.*

It asks nothing in the wizard. It runs in the background, and can read and change the note being
built, or pass values to the next steps through `context`.

## Settings

- The **script editor** — your code. Under it, **Your script is handed:** lists the variables you can
  insert, and **Examples** inserts a working starting point.
- **If it fails** — what a failure here should do to the work around it. The run is recorded either
  way. Default: **Tell me and carry on**.
    - **Tell me and carry on** — a notice with the error; the note is still built.
    - **Carry on quietly** — no notice. Still recorded in the run log.
    - **Skip the rest of this step** — the note is still created, without what this step had left
      to do.
    - **Stop building the note** — nothing is written. Use it when the note makes no sense without
      this script.

  When the script has failed before, the line under it says how often and when.
- **Try it in the workbench** — opens the [script workbench](../architecture/script-workbench.md),
  where you try the script against a real note. Nothing is written: what it would write is shown as
  a difference.
- **Debug script** — **Run** runs the script with mock data and shows the result under it; **Clear
  output** empties it.

## Available variables

A script receives exactly these six variables:

| Variable | What it is |
|---|---|
| `element` | The action's own configuration — `element.code` is the script itself. |
| `content` | The note body and properties under construction. |
| `note` | The note's title and target folder. |
| `context` | A scratch object shared between the steps of one run. |
| `zf` | The [ZettelFlow script API](../api/ZettelFlowAPI.md). |
| `app` | Obsidian's own API ([reference](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)). |

What the editor offers, **Debug script** and the real run all use this same list, so what you see
while writing is what you get when the note is built. The editor completes `zf.`, `content.` and your
own `zf.internal.user.` scripts from the live objects, hovers show signatures, and syntax errors show
in the gutter as you type.

### `note`

- `setTitle(title: string)` — set the note's title.
- `getTitle(): string` — the note's title.
- `setTargetFolder(folder: string)` — set the folder the note is created in.
- `getTargetFolder(): string` — that folder.

### `content`

- `add(content: string)` — add text to the note.
- `get(): string` — the note's text.
- `modify(key: string, result: string)` — replace `{{key}}` in the note with `result`.
- `addTag(tag: string)` / `addTags(tags: string[])` — add tags to the note's properties.
- `getTags(): string[]` — the note's tags.
- `addFrontMatter(frontmatter: Record<string, Literal>)` — add properties.
- `getFrontMatter(): Record<string, Literal>` — the note's properties.

### `context`

An empty object to pass data between steps. A value an earlier step put there with **Where it
writes** → **Context only** is readable here, and what you set here is readable by the next steps as
`{{key}}`.

## Example

```javascript
content.addFrontMatter({ created: new Date().toISOString() });
context.reviewer = "Ana";
```

## What it writes

Only what your script writes, e.g.:

```yaml
---
created: 2026-10-13T09:30:00.000Z
---
```

# ZettelFlow cookbook

Practical, copy-paste recipes for power users (epic #246 B3) — the *hard to master* end. They run in a
**Script action** on a canvas step, a **property hook**, or (for the conditionals) a
[trigger condition](../architecture/trigger-conditions.md). Full surface: the
[API reference](ZettelFlowAPI.md).

In a Script action you have `content` (the note being built), `context` (values collected by earlier
steps), `note`, `app` (the Obsidian app), and `zf` (the [ZettelFlow API](ZettelFlowAPI.md)).

## Compute a frontmatter field on creation

```javascript
// Stamp a daily link and a computed slug.
const today = `[[${moment().format('YYYY-MM-DD')}]]`;
content.addFrontMatter({
  dailyLink: today,
  slug: (context.title ?? '').toLowerCase().replace(/\s+/g, '-'),
});
```

## Move the new note based on a choice

```javascript
// `context.targetFolder` was collected by a dynamic-selector step.
const file = app.workspace.getActiveFile();
await app.vault.rename(file, `${context.targetFolder}/${file.basename}.${file.extension}`);
```

## List the notes in a folder (build an index)

```javascript
const folder = zf.internal.vault.resolveTFolder('Projects');
const notes = zf.internal.vault.obtainFilesFrom(folder, ['md']);
content.add('\n## Projects\n' + notes.map(f => `- [[${f.basename}]]`).join('\n'));
```

## Guard an event trigger with a condition

```javascript
// In a step's trigger condition (see the trigger-conditions page):
event.property === 'status' && event.newValue === 'permanent'
```

## Ask your knowledge graph

You don't always need a script — ZettelFlow surfaces the graph directly:

- **Typed relations** written by the relation actions (`supports:`, `contradicts:`, `expands:` …) are
  ordinary frontmatter, so you can query them with **Dataview**:
  ```dataview
  LIST FROM "" WHERE contains(contradicts, this.file.link)
  ```
- **Concept navigation** walks the graph by typed relation; **Open questions** lists every unanswered
  `question::`; the **Evidence map** synthesizes a note from its own graph — all read-only, offline,
  reachable from the *Open ZettelFlow* ribbon menu.

## Integrate Templater / Dataview

```javascript
const tp = zf.external.tp;      // Templater (if installed)
const dv = zf.external.dv;      // Dataview (if installed)
```

See the [API reference](ZettelFlowAPI.md) for the full `zf.internal` / `zf.external` surface and the
`.js` editor's `zf.` / `app.` autocomplete.

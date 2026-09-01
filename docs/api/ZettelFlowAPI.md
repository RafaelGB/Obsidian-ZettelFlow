# ZettelFlow API Reference

This document describes the API provided by ZettelFlow that can be used in Scripts, Hooks, and other programmable components.

## Overview

The ZettelFlow API is organized into four sections:

- **Knowledge** (`zf.knowledge`): the analyses ZettelFlow runs on your vault, callable from your code
- **AI** (`zf.ai`): the configured model, behind a proposal you rule on
- **Internal API** (`zf.internal`): native vault helpers and your own library scripts
- **External API** (`zf.external`): integrations with other plugins

`internal` / `external` describe ZettelFlow's own layering rather than anything you care about, so the
newer namespaces sit at the top level. Nothing moved — every existing script keeps working.

> **Editor autocomplete.** In the `.js` script editor, typing `zf.` / `app.` triggers
> ZettelFlow-aware completions (badged ✨): `zf.internal.vault`, `zf.internal.user`,
> `zf.external.tp`/`dv`, and the common `app.*` members. They are prioritised above the editor's
> default JavaScript suggestions.

## Knowledge (`zf.knowledge`)

ZettelFlow models your vault as a graph of ideas and runs a set of pure, offline analyses over it —
the same ones behind Home, Health, the dashboard and the recommendations. `zf.knowledge` hands your
code those analyses **with the live model already bound**, so you call `zf.knowledge.debt()`, never
`debt(model)`.

```javascript
// Everything you have connected but never ruled on.
const neglected = zf.knowledge.unexamined({ limit: 10 });

// The same "what to do next" list the Home surface shows.
const next = zf.knowledge.recommendations();

// Embed vault metrics in the note being built.
content.addFrontMatter({
    vault_notes: zf.knowledge.model().size(),
    ready_to_cultivate: zf.knowledge.readyToCultivate(),
});
```

| Member | Answers |
|---|---|
| `ready()` · `model()` | Whether the index is built; the raw idea graph for questions no projection answers. |
| `dashboard()` · `balance()` · `debt()` · `health()` | Vault-wide metrics. |
| `review(now?, windowDays?)` | What changed, stalled and matured recently. |
| `discoveries(opts?)` · `map(opts?)` | Unlinked pairs that co-occur; clusters and hubs. |
| `openQuestions()` · `proposeAnswers(path)` | Unanswered questions, and notes that could answer one. |
| `neighbors(path)` · `reasoningPaths(start, opts?)` · `query(source, now?)` | Graph traversal. |
| `evidence(path)` · `outline(paths, opts?)` | What supports/contradicts an idea; an outline from a set of notes. |
| `recommendations()` · `cultivationQueue(exclude?, limit?)` · `readyToCultivate()` | What to do next. |
| `unexamined(opts?)` · `agency(path)` · `judgements(path)` · `lastJudgement(path)` | The [judgement record](../development/cognitive-agency.md). |

!!! warning "Check `ready()` on startup"
    The index rebuilds in memory when Obsidian loads. A projection called before it finishes **throws**
    rather than returning an empty result — an empty answer would be indistinguishable from *"your
    vault really is empty"*, which is the worst lie a knowledge tool can tell.

!!! info "Read the whole model, write only your note"
    `zf.knowledge` is entirely read-only. Your script still writes the way it always did — through
    `content`, `note`, or a hook's `event.response`. Nothing here can modify your vault.

## AI (`zf.ai`)

`zf.ai` reuses the provider you already configured in settings — no API key duplicated into a script —
and routes every completion through the same **proposal** as the built-in AI actions.

```javascript
const answer = await zf.ai.propose("Summarise this note in one sentence:\n" + content.get(), {
    path: note.getFinalPath(),
    subject: "one-line-summary",
});
if (answer) content.addFrontMatter({ summary: answer });
```

| Member | Behaviour |
|---|---|
| `available()` | Whether a provider is enabled and configured. |
| `propose(prompt, opts?)` | Shows the completion for you to accept, edit or reject. Returns your text, or `null` if you rejected or dismissed it. |

There is deliberately **no** "just give me the completion" variant. A model's output reaches your vault
only through a verdict you gave, and that verdict is recorded — see
[constitution §XII](../development/constitution.md). This is not a restriction on your script: it could
always call any HTTP endpoint itself. It is the path that happens to be both the easiest and the
correct one.

## Internal API

### Vault Operations (`zf.internal.vault`)

Functions for working with the Obsidian vault, files, and folders.

#### `resolveTFolder(path: string): TFolder`

Resolves a path to a folder object.

- **Parameters**:
  - `path`: String path to the folder
- **Returns**: TFolder object
- **Throws**: Error if the path doesn't resolve to a folder

```javascript
// Example: Get a folder reference
const folder = zf.internal.vault.resolveTFolder("MyNotes/Projects");
```

#### `obtainFilesFrom(folder: TFolder, extensions: string[]): TFile[]`

Gets files from a folder with optional extension filtering.

- **Parameters**:
  - `folder`: TFolder object to search in
  - `extensions`: (optional) Array of file extensions to filter by. Defaults to `["md", "canvas"]`
- **Returns**: Array of TFile objects sorted alphabetically by basename

```javascript
// Example: Get all markdown files from a folder
const folder = zf.internal.vault.resolveTFolder("MyNotes/Projects");
const mdFiles = zf.internal.vault.obtainFilesFrom(folder, ["md"]);
```

### User Scripts (`zf.internal.user`)

User-defined scripts that are loaded from the JS library folder.

Each script is available as a function under the `zf.internal.user` namespace, with the script filename (without extension) as the function name.

```javascript
// Example: Call a user script named "formatDate.js"
const formattedDate = zf.internal.user.formatDate(new Date());
```

## External API

### Dataview (`zf.external.dv`)

The complete [Dataview API](https://github.com/blacksmithgu/obsidian-dataview/blob/master/src/api/plugin-api.ts) (available if the Dataview plugin is installed).

```javascript
// Example: Query files using Dataview
const results = zf.external.dv.pages('#project')
  .where(p => p.status !== "Complete")
  .sort(p => p.priority, 'desc');
```

### Templater (`zf.external.tp`)

User scripts from the [Templater plugin](https://silentvoid13.github.io/Templater/user-functions/script-user-functions.html) (available if Templater is installed).

```javascript
// Example: Use a Templater user script
const result = zf.external.tp.user.myScript();
```

## Common Context Variables

Every scripting surface binds `zf` and `app`. What else is in scope depends on where your code runs:

| Surface | Variables |
|---|---|
| [Script action](../actions/Script.md) | `element`, `content`, `note`, `context`, `zf`, `app` |
| [Dynamic Selector](../actions/DynamicSelector.md) | `zf`, `app` |
| [Property hook](../vault-hooks/property-hooks/configuration.md) script | `event`, `zf`, `app` |
| Run conditions (hook, canvas edge, workflow trigger) | `event`, `zf`, `app` |

These lists come from one binding contract in the source, which is also what the editors advertise and
what the **Run** / dry-run buttons execute against — so an editor cannot offer you a variable that is
not really there.

### `note`

Functions for working with the current note's metadata.

- `setTitle(title: string)`: Sets the title of the note
- `getTitle()`: Returns the note title
- `setTargetFolder(folder: string)`: Sets the target folder
- `getTargetFolder()`: Returns the target folder path

### `content`

Functions for manipulating the note's content.

- `add(content: string)`: Adds content to the note
- `get()`: Gets the current content
- `modify(key: string, result: string)`: Replaces a substring with new content
- `addTag(tag: string)`: Adds a tag to frontmatter
- `addTags(tags: string[])`: Adds multiple tags to frontmatter
- `getTags()`: Gets all tags from frontmatter
- `addFrontMatter(frontmatter: Record<string, any>)`: Adds properties to frontmatter
- `getFrontMatter()`: Gets all frontmatter properties

### `context`

A shared object for storing state between different execution steps.

```javascript
// Store data in one step
context.myData = { value: 42 };

// Use it in another step
console.log(context.myData.value); // 42
```

### `app`

The Obsidian API instance for advanced operations.

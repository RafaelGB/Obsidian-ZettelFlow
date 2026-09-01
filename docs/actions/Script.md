# Script action
Executes a JavaScript script when the workflow is run. Configure the script with the code editor displayed in the settings of the action. 

## Available variables

A Script action receives exactly these six variables, in this order:

| Variable | What it is |
|---|---|
| `element` | The action's own configuration. |
| `content` | The note body and frontmatter under construction. |
| `note` | The note's title and target folder. |
| `context` | A scratch object shared between the steps of one run. |
| `zf` | The [ZettelFlow script API](../api/ZettelFlowAPI.md). |
| `app` | Obsidian's own API. |

They come from a single binding contract (`SCRIPT_ACTION_BINDINGS`), which is also what the editor's
*Available variables* list and the **Debug script** run read — so what you see while authoring is what
you get at runtime.

!!! tip "A failing script is never silent"
    If your script throws, ZettelFlow shows a notice with the error and records it in the plugin log.
    It used to fail quietly and let the note be created as if the step had worked.

## Help while you write

The editor is aware of this exact surface:

- **Completions** come from the live objects above, so `zf.knowledge.`, `content.` and your own
  `zf.internal.user.` scripts all list what is really there.
- **Hover** a member for its signature, and for the documented `zf` surface, what it answers.
- **Syntax errors** appear in the gutter as you type, rather than as a notice halfway through a run.
- **Examples** under the editor insert a working starting point — including one that reads the
  [knowledge model](../api/ZettelFlowAPI.md) and one that asks a model for a proposal you rule on.
- **Debug script** runs your code with mock data and the *same* bindings the real run uses.

### `note`
Functionalities related with the file of the note.

#### Functions
- `setTitle(title: string)`: void => Sets the title of the note.
- `getTitle()`: string => Returns the title of the note.
- `setTargetFolder(folder: string)`: void => Sets the target folder of the note.
- `getTargetFolder()`: string => Returns the target folder of the note.


### `content`
Functionalities related with the content of the note.

Example:
```javascript
content.add("Hello world!");
```

#### Functions
- `add(content: string)`: void => Add new content to the note.
- `get()`: string => get the content of the note.
- `modify(key: string, result: string)`: void => Substitute a substring of the content with the result.
- `addTag(tag: string)`: void => add a tag to the note (frontmatter).
- `addTags(tags: string[])`: void => add tags to the note (frontmatter).
- `getTags()`: string[] => get the tags of the note (frontmatter).
- `addFrontMatter(frontmatter: Record<string, Literal>)`: void => add properties to the frontmatter.
- `getFrontMatter()`: Record<string, Literal> => get the frontmatter of the note.

### `zf`
Functionalities offered by the plugin itself.

For detailed documentation on all ZettelFlow API functionality, please refer to the [ZettelFlow API Reference](../api/ZettelFlowAPI.md).

### `context`
An empty object that can be used to store data between script execution steps.

Example:
```javascript
context.myVariable = "Hello world!";
```

### `element`
The action's own configuration — for a Script action, `element.code` is the script you are reading.

### `app`
Obsidian API functionalities. [See the official documentation](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

Example:
```javascript
app.vault.getMarkdownFiles();
```

## Component
The scripts does not have a component. It is executed in the background but it can interact with the UI of another step components using the `context` variable.

The `context` variable is an empty object that can be used to store data between script execution steps. It can be used to include the result of other UI like the `Prompt` step.
# ZettelFlow API Reference

This document describes the API provided by ZettelFlow that can be used in Scripts, Hooks, and other programmable components.

## Overview

The ZettelFlow API is organized into two main sections:

- **Internal API** (`zf.internal`): Native functionalities provided by ZettelFlow
- **External API** (`zf.external`): Integrations with other plugins

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

These variables are available in both Scripts and Hooks contexts:

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

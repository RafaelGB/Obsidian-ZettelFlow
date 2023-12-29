# Script action
Executes a JavaScript script when the workflow is run. Configure the script with the code editor displayed in the settings of the action. 

## Available variables
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

#### Internal (`zf.internal`)
Native functionalities of the plugin.

##### Vault (`zf.internal.vault`)
Functionalities related with the management of the vault.
- `resolveTFolder(folder: string)`: TFolder => Resolves the target folder of the note given the path. If the folder is not defined, it returns the root folder of the vault.
- `obtainFilesFrom(folder: TFolder, extensions: string[])`: TFile[] => Returns the files of the given folder filtered by the extensions. If the extensions are not defined, it will filter by markdown and canvas files (`["md", "canvas"]`)

#### Integrations (`zf.external`)
Some plugins offer their own API to interact with them. The following integrations are available:
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview/blob/master/src/api/plugin-api.ts): `zf.external.dv` Plugin with powerful query functionalities.
Example:
```javascript
const {dv} = zf.external;
const result = dv.pages().where(p => p.file.name === "My note").select(p => p.file.name);
```

- [Templater](https://silentvoid13.github.io/Templater/user-functions/script-user-functions.html) `zf.external.tp` Plugin that allows to create templates with JavaScript.
  > ![note](https://img.icons8.com/color/20/000000/warning-shield.png)
  > This integration only supports the functions that are available in the script user functions.

Example:
```javascript
const {tp} = zf.external;
// Create a script called "myScript" in the folder defined in the settings of the Templater plugin.
const result = tp.user.myScript();
```


### `context`
An empty object that can be used to store data between script execution steps.

Example:
```javascript
context.myVariable = "Hello world!";
```

### `app`
Obsidian API functionalities. [See the official documentation](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

Example:
```javascript
app.vault.getMarkdownFiles();
```

## Component
The scripts does not have a component. It is executed in the background but it can interact with the UI of another step components using the `context` variable.

The `context` variable is an empty object that can be used to store data between script execution steps. It can be used to include the result of other UI like the `Prompt` step.
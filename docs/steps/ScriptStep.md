# Script action
Executes a JavaScript script when the workflow is run. Configure the script with the code editor displayed in the settings of the action. 

## Available variables
### `note`
Functionalities related with the file of the note.
#### Functions
- setTitle(title: string): void => Sets the title of the note.
- getTitle(): string => Returns the title of the note.
- setTargetFolder(folder: string): void => Sets the target folder of the note.
- getTargetFolder(): string => Returns the target folder of the note.


### `content`
Functionalities related with the content of the note.

#### Functions
- add(content: string): void => Add new content to the note.
- get(): string => get the content of the note.
- modify(key: string, result: string): void => Substitute a substring of the content with the result.
- addTag(tag: string): void => add a tag to the note (frontmatter).
- addTags(tags: string[]): void => add tags to the note (frontmatter).
- getTags(): string[] => get the tags of the note (frontmatter).
- addFrontMatter(frontmatter: Record<string, Literal>): void => add properties to the frontmatter.
- getFrontMatter(): Record<string, Literal> => get the frontmatter of the note.

### `context`
An empty object that can be used to store data between script execution steps.

### `app`
Obsidian API functionalities. [See the official documentation](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

## Component
No component available.
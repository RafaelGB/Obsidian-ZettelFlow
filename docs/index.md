# Welcome to ZettelFlow
> **Note:** This Documentation is still a work in progress. If you have any questions, please feel free to open a issue or disccusion.

ZettelFlow is a dynamic template engine based on Zettelkasten method. It is designed to minimize the friction between your thoughts and the final output. It is a tool that helps you to write and organize your thoughts.

## How to start
1. Create a `.canvas` file where you want (A new folder for the next steps is recommended).
2. Go to plugin configuration page and set the `.canvas` file path.
3. Starts to create template files and add them to the `.canvas` file 
4. Convert your template files into `steps` (See [examples here](https://github.com/RafaelGB/Obsidian-ZettelFlow/tree/main/WorkFlow%20Test)) by right-clicking on the file and selecting `ZettelFlow: Convert to step` (*On mobile, long press on the file and select the option*).

## How to use
The plugin offers a ribon Icon to open the note builder UI. (*You can also configure a hotkey to open it.*)

The UI will show you the steps you can select to generate a new note.

When you complete all the steps, the plugin will generate a new note with the content of the template files.

## How it works
With your `.canvas` file, the plugin creates a workflow that will be used to generate new notes. The workflow is a directed graph where the nodes are the template files and the edges are the steps. The plugin will use the workflow to generate the UI.

## Step configuration
The initial step will be a selection of all the nodes marked as `root`.

### Step types
They will be shown as a list of options to select from. The options are:

- **Bridge**: By default, all new steps are `Bridge`. No action is triggered, just read the content and the properties of the file to build the final note.
- **[Prompt](./steps/PromptStep.md)**
- **[Selector](./steps/SelectorStep.md)**
- **[Calendar](./steps/CalendarStep.md)**


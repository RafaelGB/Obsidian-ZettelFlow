# Configuring Property Hooks

Property hooks can be configured through the ZettelFlow settings panel. You can add, edit, and remove hooks for different frontmatter properties.

## Accessing Property Hooks Settings

1. Open Obsidian Settings
2. Navigate to the ZettelFlow plugin settings
3. Scroll down to the "Hooks" section
4. Find the "Property Hooks" subsection

## Adding a New Property Hook

1. Click the **Add hook** button
2. Select a property from the search (this shows all available frontmatter property types in your vault)
3. Click **Add** to confirm — the new hook appears in the list, already expanded, ready to edit

## Editing a Property Hook

Once you've added a hook, expand it to edit:

1. Click the expand button (down arrow) on the hook
2. (Optional) Give it a **Description** — a human label shown in the list instead of the raw property name
3. (Optional) Set a **Run condition** — see below
4. Write your JavaScript code in the editor
5. Click **Save hook** when done

## Enable / disable, describe, and condition

Each hook now carries a few extra controls (all optional and persisted):

- **Enabled toggle** (in the hook's header) — pause a hook without deleting it. A disabled hook is dimmed,
  marked *Paused*, and is skipped by the runtime.
- **Description** — a friendly label so a list of hooks reads clearly.
- **Run condition** — a small `zf` expression evaluated **before** the script runs; the hook only runs when
  it holds. Leave it blank to always run. The condition references the change event:
  `event.property`, `event.oldValue`, `event.newValue`, `event.notePath`. Example insert-buttons and a live
  sanity check are provided. For the full vocabulary see
  [Trigger conditions](../../architecture/trigger-conditions.md).

    ```js
    event.newValue === 'done'                                   // only when the value becomes "done"
    event.property === 'status' && event.newValue === 'done'    // explicit property + value
    ```

## Test on the active note (dry run)

Inside a hook's editor, **Test on active note** runs the hook (condition + script) against the note you have
open and shows exactly what it *would* set, remove, or trigger — **without writing anything**. Use it to
author a hook safely before you rely on it.

## Script Environment

When writing your hook script, you have access to these variables:

- `event`: An object containing:
  - `request`: Information about the property change
    - `oldValue`: The previous value of the property
    - `newValue`: The new value of the property
    - `property`: The name of the property that changed
  - `file`: The TFile object representing the current file
  - `response`: Object where you can set new frontmatter values
    - `frontmatter`: Record of property/value pairs to update/add to the frontmatter
    - `removeProperties`: Array of properties to delete from the frontmatter
    - `flowToTrigger`: Canvas name to trigger (if applicable). It must be avaliable in the vault inside the path defined in the ZettelFlow settings panel - hooks section. It can only be initialized once and will be triggered when the all hooks are finished.

- `zf`: Access to ZettelFlow functions and utilities. For detailed documentation on all ZettelFlow API functionality, please refer to the [ZettelFlow API Reference](../api/ZettelFlowAPI.md).

- `app`: Obsidian's own API. [See the official documentation](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

The **run condition** receives the same `zf` and `app`, alongside its own flat `event` shape
(`event.property`, `event.oldValue`, `event.newValue`, `event.notePath`).

## Saving Updated Frontmatter

To update frontmatter properties as a result of your hook, add them to the `event.response.frontmatter` object:

```javascript
// Example: Update a 'status' property when 'progress' reaches 100
if (event.request.property === 'progress' && event.request.newValue === 100) {
  event.response.frontmatter.status = 'Complete';
}

// Always return the event object
return event;
```

## Managing Hooks

- **Reordering**: Drag and drop hooks to change their execution order
- **Deleting**: Click the X button on a hook to remove it
- **Editing**: Expand a hook to edit its script

# Configuring Property Hooks

Property hooks can be configured through the ZettelFlow settings panel. You can add, edit, and remove hooks for different frontmatter properties.

## Accessing Property Hooks Settings

1. Open Obsidian Settings
2. Navigate to the ZettelFlow plugin settings
3. Scroll down to the "Hooks" section
4. Find the "Property Hooks" subsection

## Adding a New Property Hook

1. Click the "Add Hook" button
2. Select a property from the dropdown menu (this shows all available frontmatter property types in your vault)
3. Click "Add Hook" to confirm

## Editing a Property Hook

Once you've added a hook, you can expand it to edit:

1. Click the expand button (down arrow) on the hook
2. Write your JavaScript code in the editor
3. Click "Save Hook" when done

## Script Environment

When writing your hook script, you have access to these variables:

- `event`: An object containing:
  - `request`: Information about the property change
    - `oldValue`: The previous value of the property
    - `newValue`: The new value of the property
    - `property`: The name of the property that changed
  - `file`: The TFile object representing the current file
  - `response`: Object where you can set new frontmatter values
    - `frontmatter`: Record of property/value pairs to update

- `zf`: Access to ZettelFlow functions and utilities

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

# Property Hooks Overview

## What are Property Hooks?

Property Hooks are a powerful feature in ZettelFlow that allow you to execute custom JavaScript code when the value of a specific property changes in your frontmatter. This enables dynamic, automated responses to changes in your notes' metadata.

## How Property Hooks Work

When you edit a note's frontmatter in Obsidian and change a property value that has a hook configured, ZettelFlow detects this change and executes the associated script. The script has access to:

- The old value of the property
- The new value of the property  
- The file being modified
- The ability to modify other frontmatter properties

## Key Benefits

- **Automation**: Automate tasks based on metadata changes
- **Data Consistency**: Maintain relationships between different properties
- **Dynamic Content**: Update content based on metadata changes
- **Integration**: Connect your notes with external systems or internal note structures

## Common Use Cases

- Automatically update a "modified" date when specific properties change
- Set status properties based on changes to other properties
- Calculate derived properties (like priorities, estimates, etc.)
- Trigger notifications or create linked notes when properties reach certain values
- Maintain bidirectional relationships between notes

## Implementation

Property hooks are implemented in the VaultHooks class of the ZettelFlow plugin. When a file's metadata cache is updated, the plugin checks if any monitored properties have changed and executes the corresponding scripts.

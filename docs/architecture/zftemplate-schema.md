# .zftemplate schema

Version: **1.0**

A `.zftemplate` file is a plain JSON document that bundles a ZettelFlow canvas with its associated step files so users can share workflows offline, as a single portable file.

## Top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `zfVersion` | string | ✓ | Schema version (currently `"1.0"`) |
| `name` | string | ✓ | Human-readable workflow name |
| `description` | string | ✓ | Short description of the workflow |
| `author` | string | ✓ | Creator name or identifier |
| `canvas` | `ZfTemplateFile` | ✓ | The canvas file |
| `steps` | `ZfTemplateFile[]` | ✓ | Associated step files (may be empty) |
| `difficulty` | `"easy" \| "medium" \| "hard"` | — | Optional gallery badge (#285). Signals how much a system asks of a new user; omit to hide the badge |

## ZfTemplateFile

| Field | Type | Required | Description |
|---|---|---|---|
| `filename` | string | ✓ | Original filename (e.g. `my-flow.canvas`, `intro.md`) |
| `content` | string | ✓ | Raw text content of the file |

## Example

```json
{
  "zfVersion": "1.0",
  "name": "Daily notes flow",
  "description": "A canvas that creates structured daily notes",
  "author": "alice",
  "canvas": {
    "filename": "daily-notes.canvas",
    "content": "{\"nodes\":[...],\"edges\":[...]}"
  },
  "steps": [
    {
      "filename": "morning-step.md",
      "content": "---\nzettelFlowSettings:\n  root: true\n  label: Morning check-in\n  actions: []\n---\n# Morning\n"
    }
  ]
}
```

## Import / Export commands

| Command | Condition | Description |
|---|---|---|
| `ZettelFlow: Export current canvas as .zftemplate` | Desktop only | Reads the active canvas and all its `.md` step nodes, then downloads a `.zftemplate` file |
| `ZettelFlow: Import .zftemplate` | Desktop only | Opens a file picker; installs the canvas and steps into a user-chosen vault folder |

On conflict (files already exist), the user is prompted to overwrite or skip — no `confirm()` is used.

## Community systems (#214)

The same format powers the community **systems** gallery. A shipped system is a `.zftemplate` file
listed in `docs/main_template.json` with `template_type: "system"`; the community browser's
`CommunitySystemModal` fetches it, lets the user pick a folder, and writes the canvas + steps in one
click (no clipboard). See [Community gallery](community.md). Authoring guide:
[Contribute a community system](../how-to-contribute/community-examples.md).

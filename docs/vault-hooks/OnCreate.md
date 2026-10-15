# Folder flows

A **folder flow** is a flow with the role *runs on a folder* ([flow roles](../architecture/flow-roles.md),
#437). Create a note in that folder — by any means: a new file in Obsidian, a sync, another plugin —
and the wizard opens on the folder's flow, so every note there goes through the same steps.

## The door: the folder's own menu

Right-click a folder in the file explorer and choose **Edit folder workflow**. ZettelFlow opens the
folder's flow canvas in a new tab, creating an empty one the first time. Build the flow on it like
any other: steps, actions, exits.

The canvas lives in the **folder-flows folder** (default `_ZettelFlow/folders`) and is **named after
the folder**: its path with each `/` replaced by `_`. The folder `Profiles` gets
`_ZettelFlow/folders/Profiles.canvas`; `Work/Clients` gets `Work_Clients.canvas`. That name is the
whole link — nothing is written into the folder or the note.

## Where it is in settings

- **Settings → Flows → Your flows** lists every canvas with a role, the folder flows included, and
  is where you change a role. *Give a role to another canvas* turns an existing canvas into a folder
  flow: choose *runs on a folder* and it asks **which folder**, shows the move it is about to make,
  and applies it on a second click.
- **Settings → Advanced → Folders ZettelFlow uses → Folder flows** (behind *Show advanced
  settings*) is the folder-flows folder itself.

## What happens, exactly

- The flow fires for a note created **directly** in the folder. A sub-folder is a folder of its
  own, with its own flow or none.
- Renaming a folder renames its flow canvas with it, so the link survives.
- A note created through the ZettelFlow **wizard** (the ribbon, a command) does not trigger the
  folder flow a second time: the wizard is already running.

## Example

You keep people in `Profiles` and want an email, a team and a name on each of them.

1. Right-click `Profiles` → **Edit folder workflow**. `_ZettelFlow/folders/Profiles.canvas` opens.
2. Add a step with three prompt actions — email, team, name — writing to the frontmatter.
3. Create a new note in `Profiles`. **Expect** the wizard to open on that step.

## Troubleshooting

- **The wizard does not open.** Check that the canvas sits in the folder-flows folder under the
  folder's exact name (**Settings → Flows → Your flows** shows it as *runs on a folder*), and that
  the note was created directly in that folder.
- **It did not open for a note made from the ribbon.** Intended: a note the wizard creates never
  re-triggers its folder's flow.

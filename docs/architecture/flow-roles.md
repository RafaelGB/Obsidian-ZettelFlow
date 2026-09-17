# Your flows: a canvas has a role

A ZettelFlow canvas is not just a file: it has a **role**, and the role is how you launch it, what
its steps can be configured with, and where the gallery puts a system when it installs one.

| Role | Where it lives | How it runs |
|---|---|---|
| **Creates notes** | the *new notes canvas* setting | the ribbon icon and the create command |
| **Edits the open note** | the *editor canvas* setting | the edit command, at your cursor |
| **Runs on a folder** | a canvas under the folder-flows folder, **named after the folder** | creating a note in that folder |
| **Runs on an event** | a canvas under the **events folder** | a vault event, through its first step's trigger |
| **Runs from a hook** | a canvas under the hooks folder | a property hook |
| **No role** | anywhere else | only the *run a flow* command |

Settings → **Your flows** lists every canvas that has one, and is where you change them.

## The role is derived, never stored

Nothing is written into your `.canvas` file. The role is read from the settings and the folders you
already have — one pure function, `flowRole(path, folders)`, which four different places used to
re-derive by hand and had already drifted apart: one forgot the hooks folder, another the editor
canvas, and all of them matched folders with a plain `startsWith`, so `_ZettelFlow/folders2` looked
like it was inside `_ZettelFlow/folders`.

Precedence is stated rather than incidental: a canvas you named by hand (create, edit) keeps that
role even if it also sits in one of the folders.

## Changing a role always says what it costs

Two of the roles are **exclusive** — one canvas at a time — and two of them are **places**, so
taking one moves the file:

- giving *creates notes* to another canvas names the one that stops holding it, which **keeps
  existing as a file**;
- giving *runs on an event* moves the canvas into the events folder;
- giving *runs on a folder* asks **which folder**, because a folder flow is found by its name.

Every one of those is shown before it happens and applied by a second, explicit click. The move
goes through Obsidian's `FileManager`, so links to the canvas follow it.

## The events folder

Event flows have their own home, separate from the folder flows. They used to share one, which
made a canvas two things at once: the automation of a folder (by its filename) *and* an event flow
(if its first step happened to carry a trigger).

The two folders may be neither the same nor inside one another — the setting refuses a value that
collides and says which folder it collided with, keeping the previous one.

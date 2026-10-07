# Your flows: a canvas has a role

A ZettelFlow canvas is not just a file: it has a **role**, and the role is how you launch it, what
its steps can be configured with, and where the gallery puts a system when it installs one.

| Role | Where it lives | How it runs |
|---|---|---|
| **Creates notes** | the *new notes canvas* setting | the ribbon icon and the create command |
| **Edits the open note** | the *editor canvas* setting | the edit command, at your cursor |
| **Crystallizes thoughts** | the *crystallize canvas* setting | crystallizing into a new note in Think, the highlights review or the Library |
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

Precedence is stated rather than incidental: a canvas you named by hand (create, edit,
crystallize) keeps that role even if it also sits in one of the folders. Such a canvas stays where
it is, so a folder or event flow there would still run by its place — keep a named canvas out of
those folders.

## One role per canvas

A canvas has **one** role. Giving it a role replaces the one it had, and the dialog says so first:
*This canvas stops being: Creates notes.* (Before #712 that held only on screen — the ribbon canvas
given *Edits the open note* silently stayed both.) A named role also follows its canvas: rename the
canvas and the setting follows; delete it and the role is free again.

## Changing a role always says what it costs

Three of the roles are **exclusive** — one canvas at a time — and two of them are **places**, so
taking one moves the file:

- giving *creates notes* (or *edits the open note*, or *crystallizes thoughts*) to another canvas
  names the one that stops holding it, which **keeps existing as a file**;
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

## Crystallizes thoughts

When you crystallize thoughts into a **new** note in Think (or from the highlights review, or a
passage in the Library), the canvas with this role builds it — an ordinary flow that opens with the
note's title and content already filled in, so its steps choose the folder, the template and the
properties as for any note. With no canvas in this role, crystallizing writes the note at the vault
root, as it always did. Its steps can place the crystallized text with four placeholders:

| Placeholder | Becomes |
|---|---|
| `{{crystallize.content}}` | your thoughts, *Born from* and the `source::` lines — at the top of the body when no step places it |
| `{{crystallize.title}}` | the title you accepted in the preview |
| `{{crystallize.quote}}` | the passages of the highlights it came from |
| `{{crystallize.source}}` | the sources it cites, comma-separated |

In any other flow they become empty text. Details in [Think → Crystallize](thought-lab.md).

_README vocabulary for this page: **Your flows have a role**, **Systems install into a role**._

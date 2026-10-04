# The settings panel

ZettelFlow's settings tab says who it is and what is on before it asks you anything, then reads
as **seven sections** organised by what you are doing, not by when each feature was written.

![The ZettelFlow settings tab: a header, four at-a-glance cards, the section bar and the sections](../resources/settings/settings.svg)

## The top of the tab

- **The header** — the ZettelFlow mark, what it does in one line, and three small links: the
  documentation, what is new in the version you run, and how to support the project.
- **At a glance** — four cards that say what is on right now, each one opening its section:
    - **Creates notes with** — the canvas your ribbon creates notes with, and how many other flows
      have a role. Orange when nothing creates notes yet.
    - **Thinking** — how many of the five Cultivate moves are on, and whether a move asks for your
      reading before it reveals its own.
    - **AI** — off, or on with the model you configured and its endpoint's host.
    - **Property hooks** — how many run, and how many are paused.

  The cards are derived from the settings, never stored, so they cannot drift from them.
- **Start creating notes** — shown only while no canvas creates notes. Three ways in, and each
  button does what it says: install a ready system from the gallery, give one of your own canvases
  the *Creates notes* role, or skip setup and open Cultivate.
- **The section bar** — one button per section. It stays at the top of the tab while you scroll
  and marks the section you are reading.

## The seven sections

| Section | Holds |
|---|---|
| **Flows** | the canvases that have a role, giving a role to another canvas, the triggers that are bound, the systems gallery |
| **Creating notes** | drafts, the target folder, the note ID prefix, density, colour by phase, opening Home at startup |
| **Your knowledge** | excluded folders as removable chips with a folder search to add one; the three lifecycle properties side by side; typed links |
| **Thinking** | *Pauses* (your reading before theirs, in Cultivate, the wizard and Explore); *Cultivate moves* as a grid of five tiles that says how many are on; *Returns and the thinking space* — [coming back](claim-returns.md#how-it-comes-back) as a slider that says its duration (7–365 days, default 90), the thinking space folder, re-running patterns; *What ZettelFlow remembers — local only*: three tiles (development journal, your decisions, idea snapshots), each with its switch and a lock line saying exactly what is stored |
| **AI** | one switch, off by default; the provider it calls, shown only when it is on; what leaves your vault, always shown |
| **Automation** | property hooks, and a link to worked examples |
| **Advanced** | every folder ZettelFlow keeps its own files in, in one grid; script type declarations; logging; the timings from this vault — folded |

### Flows, drawn as objects

**Flows** reads as three cards: *Your flows*, the *Systems gallery* and *Triggers*.

- **Your flows** shows each canvas that has a role as one row: a tile coloured by its role, the
  canvas name, its path, a dropdown to change the role, and buttons to open it and (for an
  exclusive role) to drop the role. The tile colours come from the theme: create uses the accent,
  edit green, folder orange, event blue, hook purple. Changing a role still goes through the
  confirmation dialog, which says what it changes before it does.
- **Systems gallery** has two buttons: *Browse* the community systems and *Manage* what you
  installed.
- **Triggers** lists the bound triggers. Where event flows live is a folder, and it sits with the
  other folders under **Advanced**.

### Creating notes

- **Note ID prefix** shows what the pattern produces as you type it: *Today it reads 202610041432*.
  An empty pattern reads *No prefix: a new note keeps the name you give it.*
- **Wizard density** is a two-way choice, with both sides always visible: *Comfortable* or
  *Compact*.

### AI, behind one switch

**AI** is off by default and everything works with it off. The endpoint, model, API key and the two
limits — characters sent per request and tokens requested back, one row with two inputs — appear
only once you turn it on. Whatever the switch says, a callout states what leaves your vault: only
the bounded content of an action you run, only to the endpoint you set, and nothing reaches a note
until you accept it.

### Automation

The property-hooks card puts its actions on the right — the native properties pane, *Property
types*, and *Add hook* as the primary one. Each hook reads as one line: what it is for, *when
`status` changes* under it, the property's type, a *Paused* badge when it is off, Obsidian's own
switch, and *Edit*. Under the card's name, one sentence says what a hook is for and links to
[worked examples](../vault-hooks/property-hooks/examples.md).

The tab ends on one line: the version, the documentation, where to report a problem, and how to
support the project.

## What is deliberately not here

- **A search box of our own.** Obsidian 1.13 searches settings natively, and every row exposes its
  name and description to it. Building a second search would be a worse copy of the platform's.
- **Launchers and documentation links.** The four surfaces open from the menu button and the
  command palette; the docs are this site. A settings panel that launches and documents is a menu
  and an index wearing a panel's clothes — it cost nine rows (#439). The one exception is the start
  card's *just think first*, shown only while nothing creates notes.
- **A settings view of our own.** This stays a native settings tab built from Obsidian's
  declarative definitions: the convention is part of the plugin's review score, and a custom window
  would be one more thing to learn.

## Advanced is folded, and remembers it

The Advanced section starts folded behind the toggle on its own head, because nobody should meet a
log level on their first day. It remembers whether you left it open. It holds only things that do
not change what ZettelFlow does for you:

- **Folders ZettelFlow uses** — one grid, one cell per folder, each with a folder search and a reset
  to its default: *Folder flows*, *Event flows*, *Hook flows*, *Scripts* and *Markdown templates*.
  The three flow homes still refuse a folder that is the same as, or inside, another one — a canvas
  cannot be two things at once. A path is checked and saved when you leave the field, press Enter or
  pick a suggestion — never on a keystroke on the way there. The *Thinking space* cell shows its folder and takes you to the one
  place it is edited, under Thinking: one setting, one editor.
- **Script type declarations** — writes `zettelflow.d.ts` into your scripts folder.
- **Logging** — *Off*, *Errors only*, *Warnings*, *Information*, *Debugging* or *Everything* (#439).
- **Timings from this vault** — a small table of what ran, how long, and over how many notes, read
  each time the tab is drawn.

_README vocabulary for this page: **Settings you can read**._

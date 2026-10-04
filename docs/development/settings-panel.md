# The settings panel

ZettelFlow's settings tab says who it is and what is on before it asks you anything, then reads
as **seven sections** organised by what you are doing, not by when each feature was written.

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
| **Flows** | the canvases that have a role, giving a role to another canvas, the triggers that are bound, the systems gallery, the events folder |
| **Creating notes** | drafts, the target folder, the note ID prefix, density, colour by phase, opening Home at startup |
| **Your knowledge** | what is kept out of the thinking system (excluded folders), the lifecycle properties, typed links |
| **Thinking** | *Pauses* (your reading before theirs, in Cultivate, the wizard and Explore), *Cultivate moves*, [coming back](claim-returns.md#how-it-comes-back) (7–365 days, default 90), the thinking space, re-running patterns, and what ZettelFlow remembers: the development journal, your decisions, idea snapshots |
| **AI** | one switch, off by default, and the provider it calls when on |
| **Automation** | property hooks |
| **Advanced** | the folders ZettelFlow keeps its own files in, script type declarations, logging, and the timings from this vault — folded |

### Flows, drawn as objects

**Flows** reads as three cards: *Your flows*, the *Systems gallery* and *Triggers*.

- **Your flows** shows each canvas that has a role as one row: a tile coloured by its role, the
  canvas name, its path, a dropdown to change the role, and buttons to open it and (for an
  exclusive role) to drop the role. The tile colours come from the theme: create uses the accent,
  edit green, folder orange, event blue, hook purple. Changing a role still goes through the
  confirmation dialog, which says what it changes before it does.
- **Systems gallery** has two buttons: *Browse* the community systems and *Manage* what you
  installed.
- **Triggers** lists the bound triggers and holds the events folder.

### Creating notes

- **Note ID prefix** shows what the pattern produces as you type it: *Today it reads 202610041432*.
  An empty pattern reads *No prefix: a new note keeps the name you give it.*
- **Wizard density** is a two-way choice, with both sides always visible: *Comfortable* or
  *Compact*.

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
not change what ZettelFlow does for you: the folders it keeps its own files in, the script type
declarations, the log level — which includes **off** (#439) — and the timings measured on your vault.

_README vocabulary for this page: **Settings you can read**._

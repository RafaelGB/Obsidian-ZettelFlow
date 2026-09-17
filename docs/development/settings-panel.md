# The settings panel

ZettelFlow's settings are organised by **what you are doing**, not by when each feature was
written. Eight groups, in this order:

| Group | Holds |
|---|---|
| **Your flows** | the canvases that have a role, the gallery, the triggers that are bound |
| **Creating notes** | drafts, the builder's friction, density, colour by phase, target folder, the title prefix |
| **Your vault's vocabulary** | excluded folders, the lifecycle properties, inline relations |
| **Thinking** | cultivate, judgement, patterns, the journal, the timeline |
| **AI** | one group, off by default |
| **Automation** | property hooks |
| **Advanced** | where ZettelFlow keeps its own files, script type declarations, logging — folded |
| **About** | version, documentation, support |

Above them, a line of facts states **what is on right now**: the canvas you create with, whether
AI is on and with which provider, whether the thinking friction asks first, how many property
hooks you have, and what is being logged. It is derived from the settings, never stored, so it
cannot drift from them.

## What is deliberately not here

- **A search box of our own.** Obsidian 1.13 searches settings natively, and every row exposes its
  name and description to it. Building a second search would be a worse copy of the platform's.
- **Launchers and documentation links.** The four surfaces open from the menu button and the
  command palette; the docs are this site. A settings panel that launches and documents is a menu
  and an index wearing a panel's clothes — it cost nine rows (#439).
- **A settings view of our own.** This stays a native settings tab: the convention is part of the
  plugin's review score, and a custom window would be one more thing to learn.

## Advanced is folded, not hidden

The advanced group starts collapsed behind an explicit toggle, because nobody should meet a log
level on their first day. It holds only things that do not change what ZettelFlow does for you:
the folders it keeps its own files in, the script type declarations, and the log level — which now
includes **off**, the state its separate toggle used to mean (#439).

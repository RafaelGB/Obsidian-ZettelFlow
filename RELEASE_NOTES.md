# ZettelFlow 3.1.0

The "hard to master" release — deeper thinking tools, everywhere, for everyone.

## Highlights

### 🔎 Ask your graph
Query your notes by **meaning and structure**, not frontmatter or tags — and never with AI. Compose
predicates (`state:permanent`, `relation:contradicts`, `degree>=5`, `orphan`, `unsourced`,
`older-than:30`, `about:…`) with `AND`/`OR` to answer questions Dataview can't, like *"orphaned permanents
older than 30 days that contradict X"*. Results open on click; useful queries save. Command: **Ask your graph**.

### 🌱 Cultivate, deeper
Thinking sessions are now **configurable** (choose your own recipe of moves), show a **streak** and a
**cultivation queue** so momentum is visible, and walk a real "what next" pool instead of a single pick.

### 🧭 Reasoning paths, first-class
A new **Trace reasoning paths** command surfaces the argument chains leaving a note
(`supports → expands → example → implements`), each note clickable — read-only and offline.

### 🪝 Property hooks — reliable and more capable
The hooks manager was rebuilt: **adding a hook works** (no more vanishing rows), the buttons are clean, and
each hook can now be **enabled/disabled**, **described**, gated by a **run condition**
(`event.newValue === 'done'`), and **tested on the active note** with a dry-run that previews changes
without writing.

### 🧩 Compose conditions without code
The canvas *IF* edge editor gains a **guided builder** — pick a field, an operator, and a value; a valid
expression appears, validated live. No JavaScript required.

### 📱 Everywhere and for everyone
- The 3D graph **degrades to a navigable list** on mobile (hubs first, each note one tap) instead of a blank.
- Surfaces are keyboard-operable: the segmented tabs are a proper ARIA **tablist** with arrow-key
  navigation, note names activate with Enter/Space, focus is always visible, and `prefers-reduced-motion`
  quiets the graph animation.

## Under the hood
- A modern release workflow that verifies the tag matches `manifest.version`.
- A behavioral **safety net** over the vault write paths with a ratcheting coverage floor in CI.
- Continuous **design by subtraction** — dead code removed as the surface grows.

Requires Obsidian `1.13.1`+. Desktop and mobile.

# Shinny new things

- **Ask your graph** — a deterministic query surface over the *meaning and structure* of your slip-box, never AI. Compose predicates — `state:permanent`, `relation:contradicts`, `degree>=5`, `orphan`, `unsourced`, `older-than:30`, `about:` — with `AND`/`OR` to answer questions Dataview can't, like *"orphaned permanents older than 30 days that contradict X"*. Results open on click and useful queries can be saved. Command: **Ask your graph**.
- **Cultivate — guided thinking sessions** — pick your highest-leverage idea and walk real moves on it: **connect** an unlinked neighbour, **challenge** it with its contradiction, capture a **question**, **advance** its lifecycle state, **add a source**. Each move is a one-click operation on the note and the session refines live. Choose your own **recipe** of moves, and a **streak** plus a **cultivation queue** show your momentum. Offline; AI never required.
- **A 3D knowledge graph** — an interactive force-directed view of your whole slip-box: nodes sized by connectivity and coloured by cluster, links coloured by relation type, hub glow and cluster hulls, question/source node kinds, proximity labels. Search-to-focus, state and relation filters, pin-focus, shortest path, click-a-link, time-lapse, zoom controls, fullscreen and a right-click menu — plus a discovery lens for orphans, dead-ends and contradictions.
- **Four surfaces, one front door** — the former dozen sidebar views are now four surfaces with modes behind a segmented control: **Home**, **Health**, **Discovery** and **Graph**, all reachable from a single ribbon button and opening as normal main-area tabs.
- **Community hub** — a tabbed home for the gallery: **Browse** (systems, steps, actions with search plus type and difficulty filters), **Contribute** (share your canvas as a system, suggest an idea, report a bug with your environment pre-filled, or open Discussions — all through GitHub), **Learn** (curated links to the guides and manifesto) and **Installed**. Fully static and GitHub-backed: there is no server to run.
- **Quick capture** — one command opens a single title prompt and writes a fleeting note to your Inbox. The fastest path from a thought to a note, with no canvas and no wizard; Home nudges you to develop it later.
- **Reasoning paths** — a new **Trace reasoning paths** command surfaces the argument chains leaving a note (`supports` → `expands` → `example` → `implements`), every note clickable. Read-only and offline.
- **Guided condition builder** — compose a canvas *IF* condition without writing code: pick a field, an operator and a value, and a validated expression appears in the editor.
- **Property hooks grow up** — each hook can now be **enabled or disabled** without deleting it, given a human **description**, gated by an optional **run condition** (`event.newValue === 'done'`), and **tested against the active note** with a dry run that previews the changes it would make without writing anything.
- **Knowledge scope** — keep config, templates and tooling out of the thinking system with a simple list of excluded path prefixes. Excluded notes never enter the index, so they drop out of the graph, health, discovery, Cultivate and Home all at once.
- **Home becomes opinionated** — a greeting and "thinking for N days", a one-click 3D-graph teaser, a growth nudge for fleeting notes, a Cultivate on-ramp, and a prioritised **"what to do next"** recommendation list.
- **Everywhere and for everyone** — the core loop is touch-friendly on mobile and the 3D graph degrades to a **navigable list** (hubs first, one tap per note) instead of a blank. Surfaces are keyboard-operable: the segmented tabs are a proper ARIA tablist with arrow-key navigation, note names activate with Enter/Space, focus is always visible, and `prefers-reduced-motion` quiets the graph animation.

# Improvements

- **Community browse polish** — difficulty badges on gallery systems plus a difficulty filter, linkable authors, an i18n'd gallery, and richer per-difficulty systems (including a **ZettelFlow tour** that teaches the whole workflow while you build a real note).
- **On-creation actions re-run after indexing** — knowledge actions that need the index now run once the note is indexed, so their frontmatter lands even on a cold start. On by default, bounded by a silent timeout and guarded against re-entrancy.
- **AI guardrails** — caps, explicit consent, prompt-injection hardening and endpoint safety; AI never fires automatically inside automations.
- **Performance** — revision-guarded recomputes, allocation-free adjacency with O(1) edge lookups, de-quadratic hot paths, a lite mode for the graph, and the hidden graph is paused instead of rendering off-screen.
- **Views open as main-area tabs** and the ribbon is a single all-in-one button.
- **Canvas integration is defensive** — the canvas patcher degrades gracefully when Obsidian's internals change instead of breaking the plugin.

# No longer broken

- Adding a property hook wiped the hooks panel until settings were reopened — the shared search component was calling Obsidian's `createEl` on the document, which throws and unmounts the React tree. Fixed, with per-row error boundaries so a single bad row can never blank the rest.
- The 3D graph could render blank, had low link contrast, and its controls were invisible — fixed, and 3D is now the default Graph mode.
- The canvas empty-state panel stole pointer events from the canvas underneath.
- Excluded paths did not cover ZettelFlow's own system folders, and the resurface ("forgotten") list read every vault file directly — both now honour knowledge scope, so system notes are never indexed or cultivated.
- Community difficulty tags overlapped the card text, the type and difficulty filters stacked awkwardly, and the Contribute cards clipped their description — the section is now simply **Community**, with a header badge row and one tidy filter bar.
- **Share your system** silently did nothing without an active canvas; it now explains what to do.
- Surface views registered before components, and a view type had to be a construction-safe literal — both fixed so a single failing component can't take the plugin down.

# Under the hood

- The release workflow verifies that the pushed **tag equals `manifest.version`** and publishes curated notes from `RELEASE_NOTES.md`.
- A real **safety net**: behavioural tests over the vault write paths plus a ratcheting **coverage floor enforced in CI**. 1054 tests, all blocking.
- **Design by subtraction** — the community backend, twelve retired view classes, eleven duplicate commands, the dead community-flow concept and orphaned i18n/CSS were all removed rather than left to rot.
- A **Knowledge State** projection surface and a pure **KnowledgeContext** seam now separate the model from the views, with guards keeping the pure layer Obsidian-free.
- `eslint-plugin-obsidianmd` and `oxlint` stay clean and blocking; en/es locale parity is enforced by a test.

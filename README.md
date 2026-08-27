
# ZettelFlow

[![GitHub release](https://img.shields.io/github/v/release/RafaelGB/Obsidian-ZettelFlow?style=for-the-badge&sort=semver)](https://github.com/RafaelGB/Obsidian-ZettelFlow/releases/latest)
[![Total downloads](https://img.shields.io/github/downloads/RafaelGB/Obsidian-ZettelFlow/total?style=for-the-badge)](https://github.com/RafaelGB/Obsidian-ZettelFlow/releases)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/RafaelGB?label=Sponsor&logo=GitHub%20Sponsors&style=for-the-badge)](https://github.com/sponsors/RafaelGB)

> **Most plugins help you _write_. Almost none help you _think_.**

**Stop managing notes. Start managing knowledge.** Obsidian is the store; **ZettelFlow is the engine
that makes the knowledge inside it evolve** — it doesn't manage notes, it manages the *processes that
transform knowledge*. It stands on **four pillars**:

- 🌱 **Knowledge Lifecycle** — every idea has a state (fleeting → permanent → evergreen); ZettelFlow knows the phase and proposes the next move.
- 🕸️ **Semantic Knowledge Graph** — relations with *meaning*: ask *"show me every idea that contradicts this"* and follow reasoning chains.
- 🔭 **Knowledge Discovery** — surface the unexpected: connections you didn't know you'd made, ideas worth challenging, a book outline hiding in a folder.
- 🩺 **Knowledge Health** — measure balance and richness, not volume: maturity, knowledge debt, a weekly review, a heatmap of ideas *developed*.

**AI is one Action, never the product** — every pillar works fully with AI disabled. And **nothing is
removed, only repositioned**: the canvas wizard you know is the engine's front end.

> Read the **[manifesto →](https://rafaelgb.github.io/Obsidian-ZettelFlow/manifesto/)** · **[full documentation →](https://rafaelgb.github.io/Obsidian-ZettelFlow/)**

---

### How it works, in one line

**ZettelFlow turns an Obsidian Canvas into a guided note-creation wizard.** Draw your workflow as a graph — steps as nodes, order as arrows — and the plugin walks you through it every time you create a note, filling in frontmatter, body content, dates, selectors, and more without you touching a template manually. Each step is a piece of the cognitive engine; each note lands already related, cross-checked and scored.

---

## Zettelkasten toolkit

ZettelFlow is more than a note templater — it is a full **Zettelkasten workflow**. Beyond the
canvas wizard, it ships a set of tools that grow and maintain your slip-box:

- **🏠 ZettelFlow Home** — *open ZettelFlow, not Obsidian.* A single front door: a greeting and
  "you've been thinking for N days", a one-click **3D-graph teaser**, a **growth nudge** ("N fleeting
  notes ready to develop") that jumps straight to the latest capture, your new ideas, main concepts,
  notes that deserve a review, suggested connections, a **"what to do next"** list of prioritized
  recommendations (click to jump to the note), and the **next recommended session** ("Continue *Spring
  Events*"). Read-only, offline — the state of your mind at a glance.
- **⚡ Quick capture** — *from thought to note in one keystroke.* A command opens a single title
  prompt and writes a **fleeting note** to your Inbox — no canvas, no wizard, the fastest path to a
  first note. Home then nudges you to develop it later. Works on mobile; bind your own hotkey.
- **🌱 Cultivate** — *make one idea evolve.* A guided **thinking session** picks your highest-leverage
  idea and walks you through small, real moves on it — **connect** an unlinked neighbour, **challenge**
  it with its contradiction, capture a **question**, **advance** its lifecycle state, **add a source** —
  each a one-click operation on the note. The session refines live as you go, and the metric (degree,
  maturity, state) is a *consequence* of the work. Offline; AI is never required. This is the engine
  that makes knowledge *evolve*, not just get stored.
- **📝 Note-builder companion pane** — a live preview of the note as you build it, plus
  suggested connections to existing notes so you can link before you file.
- **📖 Derived projects** — turn a folder of notes into the *structure* of a book / course / article:
  one command clusters and orders them from the semantic graph into an outline (MOC) that links every
  source note. It organizes what you already know — graph-derived, offline, no AI.
- **🔑 Zettel ID action** — stamp every note with a stable unique identifier (sortable
  timestamp or Luhmann-style **Folgezettel** branching like `21 → 21a → 21a1`).
> **One front door, four surfaces.** The panels below live in **four surfaces** — **Home**, **Health**,
> **Discovery** and **Graph** — each with modes behind a segmented control, opened from a single
> ribbon button and as normal Obsidian tabs. Nothing is lost; every panel is a mode. See
> [The four surfaces](https://rafaelgb.github.io/Obsidian-ZettelFlow/architecture/surfaces/).

- **🩺 Slip-box health dashboard** — a sidebar that surfaces **orphan** and **dead-end** notes,
  a **Knowledge Debt score** (0–100) with a severity bar and a per-category drill-down
  (unreferenced · dangling · unsourced · open questions) each one click from a fix, and a
  **Knowledge balance** read-out — what your slip-box is made of (references · questions · examples ·
  conclusions · concepts) with balance nudges — so knowledge-debt never piles up unseen.
- **📊 Knowledge dashboard** — the *state of your system* as an ops console: connectivity %
  (connected / orphaned / unresolved), a knowledge-debt bar, and a "today" panel (to process ·
  contradictions · connections · open questions) — **every panel proposes a recommended next
  action**, one click from the surface to act on it. Read-only, offline.
- **🧩 Systems Gallery** — *somewhere to start.* Install a complete knowledge **system** in one click
  from the community browser: pick a folder and ZettelFlow writes a ready-to-run canvas plus its step
  notes (no clipboard, no manual paste), then **Run now** to use it immediately. Every system carries a
  **difficulty badge** (easy · medium · hard) so you can start where you're comfortable and grow into
  the richer ones. Start with the **🎓 ZettelFlow tour** — a three-step guided system that teaches the
  whole workflow while you build a real note. A dozen shipped systems — **Academic research ·
  Zettelkasten v2 · PARA v2 · GTD · Reading · Writing · Software architecture KB · Meeting notes ·
  Daily journal · Concept note · Decision journal · Inquiry** — each composing the cognitive actions on
  creation (the medium/hard ones wire up the full relation · research · maturity pipeline), so a new
  note lands already related, cross-checked and scored. Offline, no AI. This is the one way to adopt a
  workflow — it replaces the old starter-flow and methodology-package installers.
- **🗺️ Map-of-content builder** — gather notes by tag/folder into a MOC and refresh it safely;
  re-runs never touch your own prose.
- **✨ Connection resurfacing** — "talk to your slip-box": for the note you're reading, see
  older, related notes worth revisiting, plus a daily spark of forgotten ideas.
- **🗓️ Second-brain review** — one command generates a weekly **review note**: ideas created,
  orphans, forgotten ideas, and important-but-unreviewed notes over the last 7 days — each a click
  from a fix.
- **🔥 Thinking heatmap** — a GitHub-style calendar of **ideas developed** (state advanced, source
  or connection added) over the last year — momentum, not note-count volume. Fed by a private,
  local, on-by-default journal (day → count only; no content, no network).
- **🔭 Morning discovery** — up to **three surprising connections**: pairs of notes that share
  concepts but aren't linked yet, one click from relating them. Graph-structural, offline — the
  value of a slip-box is in the links you *didn't* already know about.
- **🗺️ Living knowledge map** — detects your **hubs** and the notes that orbit each one, and
  regenerates as the vault changes so it never goes stale. Read-only, offline — the shape of your
  knowledge at a glance.
- **🕸️ Concept navigation** — walk your vault like a wiki you wrote: focus a note, see its typed
  neighbours (in **and** out), click one to re-focus — Learning → Memory → Spacing effect → Anki,
  no folders. Ships with headless **reasoning paths** that read the graph as an argument
  (supports → expands → example → implements). Read-only, offline.
- **🌌 3D knowledge graph** — *see the shape of your thinking.* Fly through a 3D force-directed graph
  of your slip-box: notes sized by connectivity, coloured by cluster, links coloured by relation type;
  search-to-focus, filter by state, and a **discovery lens** that lights up orphans, dead-ends and
  contradictions in space. Click a node to open it. Read-only, offline; degrades to the 2D map on
  mobile. (Graph surface → 3D mode.)
- **❓ Open questions** — every unanswered question in your vault, made first-class: each `question::`
  with no answer yet, its asker(s), and the note most likely to answer it (ranked by shared graph
  context). Read-only, offline — a live thread instead of a dead end.
- **🕰️ Evolution timeline** — the *conceptual* history of an idea (not a text diff): a per-note
  sequence of its lifecycle state + claims, captured only on meaningful change. Local, bounded,
  **opt-in** (it stores note content) — see how a claim evolved from "AI replaces us" to "AI is a copilot".
- **⚖️ Evidence map** *(experimental)* — ask "what do *you* think about this?" and get a grounded
  synthesis reconstructed only from your graph: what supports it, what contradicts it, the sourced
  evidence, the gaps — every row linked to the source note, **no invented content, no AI required**.
- **✂️ Atomicity split assist** — turn a multi-topic note into linked atomic notes in one
  command, leaving the source as a hub.
- **🌱 Note lifecycle states** — give every note a **state** (🌱 fleeting → 📝 literature →
  💡 permanent → 🔬 developing → 📚 evergreen → 🪦 archived) and move it with a validated
  **Change note state** command; the state lives in plain, configurable frontmatter.
- **🧭 Knowledge phases for steps** — tag each step in a flow with the stage of knowledge work it
  advances (Capture → Classify → Process → Connect → Develop → Review → Consolidate); the step
  builder groups your flow by phase, so a workflow reads as an arc of thinking. Distinct from a
  note's lifecycle *state*: a step has a **phase**, a note has a **state**.
- **⚡ Event-driven workflows** — let a flow **react** to vault events (a note created, a property
  or tag change) instead of only running on demand. Opt-in and **off by default**, throttled, and
  loop-guarded so a flow can never retrigger itself; an optional `zf` condition gates each trigger.
- **🧩 Visual workflow language (WHEN / IF / ACTION / WAIT)** — compose a reactive flow on the canvas
  as a readable program: **WHEN** a vault event happens, **IF** a condition holds, run an **ACTION**,
  then **WAIT** for your confirmation. WAIT is a human-in-the-loop pause; the blocks are annotated on
  the canvas so a flow reads as an arc of thinking.
- **🧠 Knowledge actions** — actions that *reason about* your slip-box, not just write to a note:
  detect an **orphan**, **calculate maturity** (0–100 from state, links, sources and age), **find
  contradictions**, **find unanswered questions**, **suggest the next move** (a concrete
  to-do: add a source, connect it, add an example, develop it), and run the **thinking simulator**
  (critical-thinking prompts adapted to a note's gaps — *what if it's false? what evidence is
  missing? what contradicts it?*) — deterministic, offline, over the knowledge model. They feed the
  knowledge-health layer.
- **🔗 Relation actions** — actions that turn connection-making into a workflow step: **find
  related** and **suggest link** rank notes worth linking by shared graph context (co-citation +
  coupling), and **create semantic relation** writes a typed edge (supports, contradicts, …) to a
  target note. Graph-structural, deterministic, offline. To undo one, the **Remove a relation**
  command lists the active note's typed relations and deletes the one you pick, after a confirmation.
- **🔍 Research actions** — actions that make sourcing and claim-checking part of the workflow:
  **extract claims**, **compare claims** (surface notes that agree with or contradict yours),
  **find sources** (suggest existing vault sources for an under-sourced note), and **attach
  source**. Over the claims-and-sources model, deterministic and offline.
- **🤖 AI actions — optional, off by default** — AI is *one action category, never the core*: the
  whole plugin works fully with AI disabled. Opt in with your own OpenAI-compatible provider
  (endpoint + key + model — OpenAI, OpenRouter, LM Studio, Ollama…) to **summarize**, **classify**,
  and **generate questions**. No bundled key, no telemetry; the note content is sent only to the
  endpoint you configure. See [AI provider setup](https://rafaelgb.github.io/Obsidian-ZettelFlow/development/ai-provider-setup/).

> New here? Open the **community browser** and install a **system** — it writes a ready-to-run canvas
> and its steps, and offers **Run now**. Everything else lives under **Settings → ZettelFlow**.

---

## How it works

```
Canvas file  ──►  ZettelFlow wizard  ──►  Note in your vault
(your workflow)   (step-by-step UI)      (frontmatter + body merged)
```

1. **Design** — Create a `.canvas` file. Each node is a step; arrows define the order. Mark one node as the root.
2. **Configure** — Right-click any canvas node → *Edit ZettelFlow step* to add actions (prompt, calendar, selector, tags…).
3. **Run** — Click the ZettelFlow ribbon button → **Create note** (or bind a hotkey to the *Open workflow* command). ZettelFlow walks the canvas graph and builds the note.

![Canvas example](docs/resources/readme/Canvas-Sample.png)
![Wizard demo](docs/resources/readme/demogif.gif)

---

## Get started in 5 minutes

**Fastest path:**

1. Install **ZettelFlow** from the Obsidian community plugin browser.
2. Click the ZettelFlow ribbon button (or run *Open ZettelFlow* from the command palette).
3. On the welcome screen, click **Create example flow** — ZettelFlow creates a sample canvas, sets it as your flow canvas, and opens it.
4. Click the ribbon button → **Create note** to run your first wizard.

**Manual path (build your own flow):**

1. Create a `.canvas` file (e.g. `flows/daily-note.canvas`).
2. In **Settings → ZettelFlow**, set that canvas as the "new notes canvas".
3. Add a note file to the canvas, right-click it → *Create managed step*, enable **Root**.
4. Click the ribbon button → **Create note** — your first wizard run.

Stuck? Read the [Getting started guide](https://rafaelgb.github.io/Obsidian-ZettelFlow/) or open a [Discussion](https://github.com/RafaelGB/Obsidian-ZettelFlow/discussions).

![Install screenshot](docs/resources/readme/install-plugin.png)

---

## Features

| Feature | Description |
|---|---|
| **Canvas-based flows** | Use Obsidian's native canvas as the workflow engine — no custom DSL to learn. |
| **Knowledge patterns** | Templates that carry behavior — on creation a pattern runs its attached offline knowledge/relation actions through the standard pipeline. The shipped **Permanent Note** pattern wires find related · find contradictions · suggest links · calculate maturity, computed against your existing graph. Results are **recomputed once, automatically, after the note is indexed**, so a brand-new note lands already connected (on by default, offline). Additive & backward-compatible; legacy templates are unchanged. |
| **31 built-in actions** | Prompt, Number, Checkbox, Calendar, Selector, Dynamic selector, Tags, Backlink, CSS classes, Task management, Script, Zettel ID, 🧠 knowledge actions — detect orphan, calculate maturity, find contradiction, find unanswered question, suggest next move, thinking simulator — 🔗 relation actions — find related, suggest link, create semantic relation — 🔍 research actions — extract claims, compare claims, find sources, attach source — and 🤖 optional AI actions (off by default) — summarize, classify, generate questions, challenge idea, synthesize, suggest connections. |
| **Conditional edges** | Label a canvas arrow `if: frontmatter.type === "meeting"` to branch the workflow at runtime. |
| **Dynamic templates** | Use `{{title}}`, `{{date}}`, `{{frontmatter.key}}`, `{{canvas.name}}` in step body templates. |
| **Live body preview** | See the rendered note body while editing a step's template (desktop). |
| **Companion pane** | Live note preview + connection suggestions while the wizard runs — link before you file. |
| **Zettel ID action** | Stable unique IDs per note: sortable timestamp or Folgezettel branching (`21 → 21a → 21a1`). |
| **Slip-box health** | Sidebar dashboard surfacing orphan (no outgoing links) and dead-end (no backlinks) notes, a **Knowledge Debt score** (unreferenced · dangling · unsourced · open questions) with a drill-down and one-click fixes, and a **Knowledge balance** read-out (references · questions · examples · conclusions · concepts) with balance nudges. |
| **Knowledge dashboard** | An ops console for the state of your system — connectivity % · knowledge debt · today (to process, contradictions, connections, open questions) — where every panel proposes a recommended next action. Read-only, offline. |
| **ZettelFlow Home** | The IDE-style front door: greeting + "thinking for N days", a one-click **3D-graph teaser**, a **growth nudge** ("N fleeting notes ready to develop" → jump to the latest), new ideas, main concepts, notes that deserve a review, suggested connections, a **"what to do next"** prioritized recommendation list (click to navigate), and the deterministic next recommended session. Read-only, offline. |
| **Quick capture** | A command opens a single title prompt and writes a fleeting note to your Inbox — the fastest path from a thought to a note (no canvas, no wizard). Mobile-friendly; bind your own hotkey. Home nudges you to develop it later. |
| **Cultivate (thinking sessions)** | A guided session that takes your highest-leverage idea and walks you through real moves on it — connect · challenge · question · advance state · add a source — each a one-click operation. The session refines live; the maturity/degree/state delta is a consequence of the work. Offline; AI optional. Home surface → Cultivate mode (or the `cultivate` command / ribbon). |
| **Derived projects** | Turn a folder of notes into an ordered book/course/article outline (MOC) — clustered and sequenced from the semantic graph, linking every source note. Graph-derived, offline, no AI. |
| **Second-brain review** | A command that generates a weekly review note — ideas created, orphans, forgotten ideas, important-but-unreviewed — each with a next action. |
| **Thinking heatmap** | A GitHub-style calendar of ideas *developed* (state advanced, source/connection added) over the last year, fed by a private on-by-default local journal (day → count only). |
| **Morning discovery** | Up to three unexpected connections — unlinked note pairs that share concepts — each one click from being related. Graph-structural, offline. |
| **Living knowledge map** | A read-only sidebar that detects your hubs and the notes clustering around them, regenerating as the vault changes. |
| **Concept navigation** | Walk your vault by typed relation (in + out) — focus a note, click a neighbour to re-focus, no folders — plus argument-forward reasoning paths over the same graph. Read-only, offline. |
| **3D knowledge graph** | An interactive 3D force-directed graph of your slip-box (Graph surface → 3D): nodes sized by connectivity and coloured by cluster, links coloured by relation type; search-to-focus, state filter, and a discovery lens for orphans · dead-ends · contradictions. Read-only, offline; 2D-map fallback on mobile. |
| **Open questions** | A vault-wide list of every unanswered `question::`, its askers, and candidate answering notes ranked by shared graph context. Read-only, offline. |
| **Evolution timeline** | The conceptual history of an idea — a per-note sequence of its lifecycle state + claim texts, captured only on meaningful change, oldest to newest. Local, bounded, opt-in. |
| **Evidence map** *(experimental)* | Compound thinking — a grounded synthesis of a note from your own graph (supports · contradicts · evidence · gaps), every row linked to its source note. No invented content, no AI. |
| **Map-of-content builder** | Gather notes by tag/folder into a MOC; re-runs update a managed region and keep your prose. |
| **Connection resurfacing** | Ranked older/related notes for the active note, with a daily-spark serendipity surface. |
| **Atomicity split** | Split a multi-topic note into linked atomic notes, leaving the source as an index/hub. |
| **Note lifecycle states** | Classify notes by phase (fleeting → … → archived) and change state with a validated command; state lives in configurable frontmatter (no lock-in). |
| **Knowledge scope** | Exclude config/template/tooling folders from the thinking system — one simple list of path prefixes. Notes under an excluded path never enter the index, so they drop out of the graph, health, discovery, Cultivate and Home all at once. |
| **Vault hooks** | Trigger flows automatically on folder creation events or frontmatter property changes. |
| **Event-driven workflows** | Let a flow react to vault events (note created/modified, a property or tag change) instead of only running on demand — off by default, throttled, and loop-guarded. |
| **Visual workflow language** | Compose a reactive flow on the canvas: WHEN a vault event happens, IF a condition holds, run an ACTION, then WAIT for your confirmation — human-in-the-loop pauses, off by default and loop-guarded. |
| **Action picker by capability** | The action picker groups actions by cognitive capability (Manipulation · Relations · Knowledge · Research · AI) instead of a flat list. |
| **Remove a relation** | A command that lists the active note's typed relations and deletes the one you pick, after a confirmation naming the exact edge. Offline. |
| **Community Hub** | A tabbed community browser — **Browse** (systems, steps, actions; search + type/difficulty filters, linkable authors), **Contribute** (share your canvas as a system, suggest an idea, report a bug with your environment pre-filled, or open Discussions — all via GitHub, no account), **Learn** (curated links to the docs guides + manifesto), and **Installed**. Fully static and GitHub-backed — no server to run. |
| **Community systems** | Install a whole knowledge system in one click — the browser fetches a `.zftemplate` bundle and writes its canvas + step notes to a folder (no clipboard). Each system shows a **difficulty badge** (easy / medium / hard); a **ZettelFlow tour** system teaches the full workflow while you build a real note. |
| **.zftemplate export/import** | Bundle a canvas and its step files into a single portable file to share with others. |
| **Notes history** | Sidebar leaf showing recently built notes with quick-open links. |
| **Mobile support** | Works on iOS and Android (`isDesktopOnly: false`). |

---

## Capabilities & privacy

ZettelFlow collects **no telemetry** and sends **no personal data or vault contents** anywhere. The plugin uses these capabilities:

- **File system (vault).** Reads canvas flow files and creates/edits notes (e.g. the **Change note state** command writes a single lifecycle property to the active note). All access goes through Obsidian's `Vault` / `FrontmatterService` API — never a hardcoded path. Works on desktop and mobile.
- **Network — optional, community feature only.** If (and only if) you open the community templates browser, ZettelFlow fetches example flows from the ZettelFlow community source. Nothing is sent unless you use this feature.
- **Script execution.** The Script action and JavaScript step files run **JavaScript you write** as part of a flow. This code runs with the plugin's access to your vault — only run scripts you trust.

See [Capabilities & privacy](https://rafaelgb.github.io/Obsidian-ZettelFlow/development/capabilities-and-privacy/) for full details.

---

## Contributing

- **Bug?** → [Open a bug report](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=bug_report.yaml)
- **Idea?** → [Open a feature request](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=feature_request.yaml)
- **Question?** → [Start a discussion](https://github.com/RafaelGB/Obsidian-ZettelFlow/discussions)
- **Code?** → Read [Contributing & conventions](https://rafaelgb.github.io/Obsidian-ZettelFlow/development/contributing-and-conventions/) and open a PR.

---

## Support

If ZettelFlow saves you time, consider supporting development:

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/5tsytn22v9Z)

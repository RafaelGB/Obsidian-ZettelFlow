<a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/"><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/resources/readme/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/resources/readme/banner-light.svg">
  <img src="docs/resources/readme/banner-dark.svg" width="100%" alt="ZettelFlow — draw your note workflow on a Canvas once, then read, think and practise with every note it makes.">
</picture></a>

<p align="center">
  <a href="https://github.com/RafaelGB/Obsidian-ZettelFlow/releases/latest"><img src="https://img.shields.io/github/v/release/RafaelGB/Obsidian-ZettelFlow?sort=semver&label=release&color=7f6df2" alt="Latest release"></a>
  <a href="https://obsidian.md/plugins?id=zettelflow"><img src="https://img.shields.io/badge/dynamic/json?logo=obsidian&color=7f6df2&label=downloads&query=%24%5B%22zettelflow%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json" alt="Obsidian downloads"></a>
  <img src="https://img.shields.io/badge/desktop%20%26%20mobile-supported-44cf6e" alt="Desktop and mobile">
  <img src="https://img.shields.io/badge/telemetry-none-44cf6e" alt="No telemetry">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/RafaelGB/Obsidian-ZettelFlow?color=8b8e94" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://obsidian.md/plugins?id=zettelflow"><img src="https://img.shields.io/badge/Install%20in%20Obsidian-7f6df2?style=for-the-badge&logo=obsidian&logoColor=white" alt="Install in Obsidian"></a>
  <a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/showcase/"><img src="https://img.shields.io/badge/See%20the%20showcase-2a2938?style=for-the-badge" alt="See the showcase"></a>
  <a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/"><img src="https://img.shields.io/badge/Read%20the%20docs-2a2938?style=for-the-badge" alt="Read the docs"></a>
</p>

<p align="center">
  <a href="#-what-it-asks-of-you">Practice loops</a> ·
  <a href="#-read-like-a-book--the-reader-and-your-library"><b>Reader &amp; Library</b></a> ·
  <a href="#-how-it-works--draw-it-once-every-note-walks-it">Canvas workflows</a> ·
  <a href="#-get-started-in-5-minutes">Get started</a> ·
  <a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/why/">Why ZettelFlow</a> ·
  <a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/reference/capabilities/">Everything it does</a>
</p>

> **Most plugins help you _write_. Almost none help you _think_.**

**Stop managing notes. Start managing knowledge.** Obsidian is the store; **ZettelFlow is the engine that makes the knowledge inside it evolve.** It turns a native Canvas into a note-creation wizard, opens your notes, PDFs and EPUBs in a Reader built for thinking, and gives you a small set of **practice loops** that ask something of *you*. Every loop is offline, works with AI switched off, and writes nothing to your vault you did not decide.

## 🔁 What it asks of you

Before any feature list, the things ZettelFlow asks you to **do** — each a small loop on your own notes, each reached where you already are (**Home**, **Think**, the **Reader**, a note's right-click menu):

| | |
|---|---|
| 🔁 **Return a claim** — say in one sentence what a note claims; later it comes back **blind** from Home and asks what you say about it *now*. [The return of a claim →](docs/development/claim-returns.md) | 📖 **Look again at what you marked** — your Reader highlights come back from Home a few at a time, with one question: *do you still think so?* [A few things you marked →](docs/development/highlights-review.md) |
| 📄 **What survived?** — at the end of a chapter you marked, the book gives you a blank leaf: your marks, what they touched, and *is one worth a note?* [What survived →](docs/development/reader.md#what-survived) | ✍️ **Recall a chapter** — put the chapter and your marks away, write what it argued in your own words, then look. Nothing is scored. [Recall →](docs/development/reader.md#recall) |
| 🎲 **Collide two notes** — from Think, two of your notes with nothing in common, side by side: what could they share? It never answers. [Two things far apart (collision) →](docs/architecture/collision.md) | ⚖️ **Place a wager** — add *what you expect to see* and *by when* to a claim; on the day, it asks what happened *before* it shows your prediction. [A wager →](docs/development/wagers.md) |
| 🧠 **Make a move on an idea** — challenge it, reframe it, branch it, set it aside: a cognitive move, recorded as something you did. [Make a move →](docs/development/cultivate.md#the-moves) | ✨ **And everything else** — the Canvas wizard, the semantic graph, health, discovery, dashboards. [Everything it does →](https://rafaelgb.github.io/Obsidian-ZettelFlow/reference/capabilities/) |

**AI is one action, never the product.** Every loop and every view works fully with AI disabled; when it is on it **proposes**, and you accept, edit or reject — the verdict is recorded, never assumed. **Knowledge with purpose** — starting from your own question and writing a provisional response — needs no AI, methodology or Canvas setup; see [Cultivate](docs/development/cultivate.md).

---

## 📚 Read like a book — the Reader and your Library

**Right-click any note → _Read from here_.** The Reader takes the window and walks you through the note and the notes around it, one chapter at a time — no MOC needed. **Your Library** puts your PDFs, EPUBs and Web Clipper articles on one shelf, beside the reading paths you saved, and opens them in the same Reader. What you mark lands in **Think**, never in the book — where you can [read it back one book at a time, in the book's order](docs/architecture/thought-lab.md#thinking-by-source-874) — and a PDF you marked can be handed back as a copy with your notes on it. **Esc** gives your workspace back exactly as it was.

<p align="center">
  <a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/"><img src="docs/resources/readme/reader-hero.svg" width="100%" alt="The Reader: the Library shelf, a book open as a two-page spread, a sentence highlighted, a question written in the margin, the thought landing in Think, your notes Alongside the page, and Listen reading aloud."></a>
</p>

<table>
<tr>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/library/#the-shelf"><img src="docs/resources/library/shelf.svg" alt="The Library: a desk and shelves"></a><br><b>A real library</b><br><sub>Books, papers, clipped articles and saved paths on shelves — yours too, drag to shelve; a cabinet at the end puts away what you no longer need.</sub></td>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/#ink-in-the-margin"><img src="docs/resources/reader/ink.svg" alt="Ink in the margin"></a><br><b>Highlight and write in the margin</b><br><sub>Write with a pen and it stays on the page; keep what you lasso. <i>Read as text</i>, when you ask, proposes what your hand says.</sub></td>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/#alongside-your-vault-beside-the-page"><img src="docs/resources/reader/alongside.svg" alt="Alongside"></a><br><b>Alongside</b><br><sub>Your own notes beside the page you are reading, each saying why it is there — and what argues with it.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/#listen"><img src="docs/resources/reader/listen.svg" alt="Listen"></a><br><b>Listen</b><br><sub>Reads aloud in your device's own voices, the page following the voice. <b>Mark</b> keeps the sentence you hear.</sub></td>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/#cite-a-passage"><img src="docs/resources/reader/cite.svg" alt="Cite a passage"></a><br><b>Cite a passage</b><br><sub>Markdown with a link back, inline, a Pandoc key, BibTeX or CSL JSON — never a guessed field.</sub></td>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/#snapshot-a-figure-or-a-table"><img src="docs/resources/reader/snapshot.svg" alt="Snapshot"></a><br><b>Snapshot a figure</b><br><sub>Drag around a chart or a table on a printed page and keep it as a note that cites its page.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/#look-up-and-translate"><img src="docs/resources/reader/lookup.svg" alt="Look up"></a><br><b>Look up, offline</b><br><sub>A word in your own dictionaries, beside the line, with no network.</sub></td>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/#the-overview"><img src="docs/resources/reader/overview.svg" alt="The overview"></a><br><b>Every page at once</b><br><sub>The camera pulls back to the whole book: your marks, your ink, your bookmarks, how far you read.</sub></td>
<td width="33%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/#on-ipad"><img src="docs/resources/reader/ipad.svg" alt="The Reader on iPad"></a><br><b>Desktop and iPad</b><br><sub>Pages, scroll or a two-page spread; swipe to turn, type you can tune, Pencil in the margin.</sub></td>
</tr>
</table>

<p align="center"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader/"><b>The Reader →</b></a> &nbsp;·&nbsp; <a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/library/"><b>Your library →</b></a> &nbsp;·&nbsp; <sub>Nothing is imported or uploaded, and your book files are never changed — archiving only moves one; a shared copy is a new file beside them.</sub></p>

---

## ⚡ How it works — draw it once, every note walks it

**Your note workflow is a Canvas.** A card is a step, an arrow is the order, a branch is a choice. Press **Create note** and ZettelFlow walks that graph with you as a short wizard — the idea, its kind, its tags, the links your vault suggests — while a live preview writes the note: frontmatter, body and file name, no template edited by hand. Then the note doesn't land alone: it arrives **in your graph, already linked**, in the region it belongs to — and you see the bridge it just made.

<p align="center">
  <a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/ask-your-graph/"><img src="docs/resources/readme/hero.svg" width="100%" alt="How ZettelFlow works, in one continuous shot: a Canvas flow is walked step by step — Capture, Classify, the Concept branch, Connect — while the wizard asks for the idea, its kind, its tags and the links your graph suggests, and the live preview fills in. Create, and the note flies into your graph, lands between two regions and draws its links."></a>
</p>

<table>
<tr>
<td width="33%" valign="top"><b>1 · Draw it once</b><br><sub>Right-click a <code>.canvas</code> → <b>Use this canvas to create notes</b>. Each card is a step, arrows set the order, a branch is a choice.</sub></td>
<td width="33%" valign="top"><b>2 · Give each step its actions</b><br><sub>Select a card → <i>Edit step</i>: ask for text, pick a date, choose an option, add tags, suggest links from your graph — <a href="docs/architecture/actions-and-note-builder.md">31 built-in actions</a>.</sub></td>
<td width="33%" valign="top"><b>3 · Walk it for every note</b><br><sub>Ribbon → <b>Create note</b> (or a hotkey for <i>Open workflow</i>). The wizard walks the graph, the preview shows the note before it exists, and <b>Create</b> lands it linked.</sub></td>
</tr>
</table>

**…and the wizard is only the door.** **[Home](docs/development/zettelflow-home.md)** is where you land each day: a greeting, Think's composer, where you left off and what came back today, answered in place.

<p align="center">
  <a href="docs/architecture/thought-lab.md"><img src="docs/resources/showcase/think.svg" width="32%" alt="Think — a place to think before it has to be knowledge"></a>
  <a href="docs/development/ask-your-graph.md"><img src="docs/resources/graph/answer.svg" width="32%" alt="Explore — ask, and the graph answers"></a>
  <a href="docs/development/cultivate.md"><img src="docs/resources/home/cultivate.svg" width="32%" alt="Cultivate — one idea, one move at a time"></a>
</p>
<p align="center"><sub><b>Think</b> · a place for what isn't knowledge yet &nbsp;·&nbsp; <b>Explore</b> · ask, and the graph answers &nbsp;·&nbsp; <b>Cultivate</b> · grow an idea by hand</sub></p>

<table>
<tr>
<td width="50%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/this-note/"><img src="docs/resources/this-note/companion.svg" alt="This note, docked in the right sidebar"></a><br><b>🧭 This note, beside every note</b><br><sub>A sidebar companion: where the note stands, what argues with it, what supports it, what it is missing — and its next step, finished in place.</sub></td>
<td width="50%" valign="top"><a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/development/base-dashboards/"><img src="docs/resources/dashboards/dashboard-hero.svg" alt="A Base dashboard with stats, a bubble chart, tasks and a calendar"></a><br><b>📊 Dashboards for your vault</b><br><sub>Point an <a href="https://help.obsidian.md/bases">Obsidian Base</a> at a folder: stat, bar, line, pie, heatmap and calendar panels with no <code>dataviewjs</code> — a local Grafana.</sub></td>
</tr>
</table>

---

## 🚀 Get started in 5 minutes

Install **ZettelFlow** from Obsidian's community plugins — or [open it in Obsidian](https://obsidian.md/plugins?id=zettelflow). Everything starts at the **ZettelFlow ribbon button**, which opens a menu.

- **See it work in one click** — ribbon → **Create note**. While no canvas creates notes, it offers **Create the example flow**: a small canvas with one step, ready to run. Press *Create note* again and walk it.
- **Learn it, or install a ready-made system** — ribbon → **[Community](docs/community/index.md)**, one view with four rooms. **Learn** has a short tutorial for every feature. **Systems** has Zettelkasten, PARA, GTD, research…: walk one on its own drawing before it writes anything, then **Install**, with *Undo* right in the notice. **Contribute** shares your canvas as a system; **Installed** takes one back.
- **No canvas at all** — ribbon → **Think** to write down a thought, or **Cultivate** to grow one idea.

**Draw your own flow:**

1. Create a canvas (e.g. `flows/Daily note.canvas`), right-click it → **Use this canvas to create notes** → **Give it the role**.
2. Open it and press **Create the first step** → *Note — file with frontmatter*. The first step starts the flow on its own.
3. Select the step → **Edit step** → **Add an action** → *Ask for text*, and write its **Question**.
4. Ribbon → **Create note**: the wizard walks your flow and creates the note.

<p align="center">
  <a href="https://rafaelgb.github.io/Obsidian-ZettelFlow/get-started/"><img src="docs/resources/readme/first-flow.svg" width="100%" alt="Your first flow, from an empty canvas to a note: right-click the canvas and choose Use this canvas to create notes, give it the role, create the first step, add Ask for text in Edit step, then the ribbon's Create note opens the wizard, which asks the question and creates the note."></a>
</p>

<details>
<summary><b>Installing, drawn</b> — Settings → Community plugins → Browse</summary>

![Installing ZettelFlow: Settings → Community plugins → Browse, search ZettelFlow, Install and Enable](docs/resources/readme/install.svg)

</details>

Stuck? Read the [getting started guide](https://rafaelgb.github.io/Obsidian-ZettelFlow/) or open a [discussion](https://github.com/RafaelGB/Obsidian-ZettelFlow/discussions).

---

## 🔒 Capabilities & privacy

ZettelFlow collects **no telemetry** and sends **no personal data or vault contents** anywhere. No account, no backend: the network is touched only by the opt-in paths below.

<details>
<summary><b>Everything the plugin can touch, and when</b></summary>

- **File system (vault).** Reads canvas flow files and creates/edits notes (e.g. the **Change note state** command writes a single lifecycle property to the active note). All access goes through Obsidian's `Vault` / `FrontmatterService` API — never a hardcoded path. Works on desktop and mobile.
- **Vault enumeration.** ZettelFlow lists every markdown file **path** to build the offline knowledge model that health, discovery, the graph and Cultivate all read. Paths and metadata only, all local — and you can keep folders out of it with the knowledge scope.
- **Network — two opt-in paths, nothing until you use them.** The **community gallery** does read-only `GET`s of the static catalog on GitHub (no backend, no account, no uploads), and the optional **AI provider** sends length-bounded note content to the single https endpoint *you* configure. Both are off until you open the browser or enable AI.
- **Dynamic code execution.** The Script action, dynamic selectors, vault hooks and workflow-event conditions run **JavaScript you write**, with the plugin's access to your vault — including read-only access to the whole knowledge model via `zf.knowledge` — so only run scripts you trust. No remote code is ever fetched or executed, and every runtime function is built in one audited module.
- **Clipboard — write only.** The “copy” buttons put a step or action configuration on your clipboard as JSON. ZettelFlow never *reads* your clipboard. **Cite**'s *Copy* puts the citation you see there, on that click only.
- **Handwriting — opt-in, per press.** Reading ink sends an image of that one ink note's strokes and its passage to your AI provider, only when you press **Read as text**. Nothing reads ink by itself.
- **The Reader's AI moves — opt-in, per click.** Six moves on a passage you selected (*Why?*, *Challenge*, *Question*, *What's the claim*, *Reflect*, *Explain*) send that passage, its paragraph and the one before, and the book and chapter titles to your AI provider, only when you click one. Nothing from your vault is sent, and nothing runs by itself. On desktop and Android, **Translate** sends one selected passage and the target language, on a click; **Look up** reads your own dictionaries on the device and makes no request at all. **Listen** uses only your device's own voices: no text leaves the device.
- **Network — the tutorial catalog, while Learn is open.** Community's **Learn** room does a read-only `GET` of the tutorial catalog and its illustrations from GitHub — the same kind of request as the gallery, made only when Learn is shown, never at startup. No account, no upload, no telemetry.

</details>

See [Capabilities & privacy](https://rafaelgb.github.io/Obsidian-ZettelFlow/development/capabilities-and-privacy/) for full details.

---

## 🤝 Contributing & support

**[Report a bug](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=bug_report.yaml)** · **[Request a feature](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=feature_request.yaml)** · **[Start a discussion](https://github.com/RafaelGB/Obsidian-ZettelFlow/discussions)** · **[Contribute code](https://rafaelgb.github.io/Obsidian-ZettelFlow/development/contributing-and-conventions/)**

If ZettelFlow saves you time, a ⭐ helps others find it — and you can support development:

<p align="center">
  <a href="https://github.com/sponsors/RafaelGB"><img src="https://img.shields.io/github/sponsors/RafaelGB?label=Sponsor&logo=GitHub%20Sponsors&style=for-the-badge&color=ea4aaa" alt="GitHub Sponsors"></a>
  <a href="https://www.buymeacoffee.com/5tsytn22v9Z"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee"></a>
</p>

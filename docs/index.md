# ZettelFlow

**ZettelFlow turns an Obsidian Canvas into a guided note-creation wizard.** Draw your workflow as a graph, configure each step with actions, and the plugin walks you through it every time you want to create a note — filling in frontmatter, body content, dates, and more automatically.

---

## Quick start

=== "New to ZettelFlow?"

    **Fastest path — let ZettelFlow set things up for you:**

    1. Install from the Obsidian community plugin browser.
    2. Click the ZettelFlow ribbon icon (or run *Open ZettelFlow* from the command palette).
    3. Click **Start with my own idea** and choose a note or capture one real idea.
    4. State your question, inspect selected material, write your response or uncertainty, and **Save progress**.

    [Purpose-led Cultivate](development/cultivate.md) needs no Canvas setup or installation. The existing
    Systems Gallery remains optional for ready-to-run workflows, including the introductory tour.

    **Manual path — build your own flow from scratch:**

    1. Create a `.canvas` file anywhere in your vault.
    2. In **Settings → ZettelFlow**, point *New notes canvas* at that file.
    3. Add a note file to the canvas, right-click → *Create managed step*, enable **Root**.
    4. Click the ribbon icon to run the wizard.

    Prefer a visual walkthrough? See [Getting started](development/getting-started.md).

=== "Already using ZettelFlow?"

    Jump straight to what you need:

    - [Actions reference](actions/Prompt.md) — form actions + knowledge actions
    - [Conditional edges](architecture/conditional-edges.md) — branch flows at runtime
    - [Dynamic variables](architecture/actions-and-note-builder.md) — `{{title}}`, `{{frontmatter.*}}`, `{{canvas.name}}`
    - [.zftemplate](architecture/zftemplate-schema.md) — export and share complete flows
    - [Vault hooks](vault-hooks/OnCreate.md) — automate note creation on folder/property events

---

## How it works

```
Canvas file          ZettelFlow wizard          Note in your vault
(your workflow)  ──►  (step-by-step UI)  ──►   (frontmatter + body merged)
```

| Concept | Description |
|---|---|
| **Canvas** | A native Obsidian `.canvas` file. Each node is a step; arrows define execution order. |
| **Step** | A note file configured with a root toggle, target folder, optional flag, body template, and one or more actions. |
| **Action** | An interactive element in the wizard (prompt, calendar, selector, tags, script…) that contributes a property or content to the built note. |
| **Root** | The node(s) the wizard presents first as entry points. |
| **Conditional edge** | An arrow labelled `if: <expression>` that the wizard skips if the condition is false. |

---

## Feature overview

| Feature | Docs |
|---|---|
| Immersive **Knowledge Galaxy** 3D graph | [Showcase →](showcase.md) · [3D graph →](development/graph-3d.md) |
| Cinematic guided tour | [Showcase →](showcase.md) |
| Share your universe (graph export) | [Showcase →](showcase.md) |
| Before/after idea card | [Showcase →](showcase.md) · [Evolution timeline →](development/evolution-timeline.md) |
| Agency review & index | [Showcase →](showcase.md) · [Cognitive agency →](development/cognitive-agency.md) |
| Guided first-run with example flow | [Getting started →](development/getting-started.md) |
| Systems Gallery (one-click) | [Systems gallery →](how-to-contribute/systems-gallery.md) |
| Built-in actions (form + knowledge) | [Actions →](actions/Prompt.md) |
| Canvas-native workflow engine | [Architecture overview →](architecture/overview.md) |
| Conditional edges (`if: expr`) | [Conditional edges →](architecture/conditional-edges.md) |
| Dynamic template variables | [Actions & note builder →](architecture/actions-and-note-builder.md) |
| Live preview in step builder | [Actions & note builder →](architecture/actions-and-note-builder.md) |
| Vault hooks (folder / property) | [Vault hooks →](vault-hooks/OnCreate.md) |
| Community templates browser | [Community gallery →](architecture/community.md) |
| `.zftemplate` export/import | [.zftemplate schema →](architecture/zftemplate-schema.md) |
| Notes history sidebar | [Architecture overview →](architecture/overview.md) |
| Active flow status widget | [Architecture overview →](architecture/overview.md) |

---

## Resources

- [GitHub repository](https://github.com/RafaelGB/Obsidian-ZettelFlow)
- [Bug reports & feature requests](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues)
- [Discussions](https://github.com/RafaelGB/Obsidian-ZettelFlow/discussions)
- [Changelog / releases](https://github.com/RafaelGB/Obsidian-ZettelFlow/releases)
- [Project roadmap](https://rafaelgb.github.io/Obsidian-ZettelFlow/development/project-health-and-roadmap/)

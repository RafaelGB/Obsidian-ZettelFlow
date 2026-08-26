# ZettelFlow

**ZettelFlow turns an Obsidian Canvas into a guided note-creation wizard.** Draw your workflow as a graph, configure each step with actions, and the plugin walks you through it every time you want to create a note — filling in frontmatter, body content, dates, and more automatically.

---

## Quick start

=== "New to ZettelFlow?"

    **Fastest path — let ZettelFlow set things up for you:**

    1. Install from the Obsidian community plugin browser.
    2. Click the ZettelFlow ribbon icon (or run *Open ZettelFlow* from the command palette).
    3. On the welcome screen, click **Create example flow** — ZettelFlow creates a sample canvas and step template, sets it as your flow canvas, and opens it.
    4. Run the ribbon icon again to try your first wizard.

    **Manual path — build your own flow from scratch:**

    1. Create a `.canvas` file anywhere in your vault.
    2. In **Settings → ZettelFlow**, point *New notes canvas* at that file.
    3. Add a note file to the canvas, right-click → *Create managed step*, enable **Root**.
    4. Click the ribbon icon to run the wizard.

    Prefer a visual walkthrough? See [Getting started](development/getting-started.md).

=== "Already using ZettelFlow?"

    Jump straight to what you need:

    - [Actions reference](actions/Prompt.md) — all 11 built-in actions
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
| Guided first-run with example flow | [Getting started →](development/getting-started.md) |
| Systems Gallery (one-click) | [Systems gallery →](how-to-contribute/systems-gallery.md) |
| 11 built-in actions | [Actions →](actions/Prompt.md) |
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

# ZettelFlow

**ZettelFlow turns an Obsidian Canvas into a guided note-creation wizard — and then helps you *think* about what you wrote.** Draw your workflow as a graph, configure each step with actions, and the plugin walks you through it every time you create a note. Around that engine sit the tools that make the knowledge evolve: explore it, review its health, and practise on it.

New here? The [README](https://github.com/RafaelGB/Obsidian-ZettelFlow#readme) is the front door — it opens with the handful of things ZettelFlow *asks you to do*. This site is the **map**: where each area lives, one entry each.

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

## The map — where each area lives

One entry per area; each links to the page that owns it. For the **complete, ranked** list of every
capability, see [Everything it does](reference/capabilities.md).

- **Create & run** — draw a Canvas workflow and let the wizard build the note.
  → [Architecture overview](architecture/overview.md) · [Actions](actions/Prompt.md) · [Conditional edges](architecture/conditional-edges.md) · [Flow roles](architecture/flow-roles.md)
- **Explore** — narrow your vault by clicking, walk it by relation, fly the 3D graph.
  → [Explore your graph](development/ask-your-graph.md) · [The graph](development/graph-3d.md) · [Concept navigation](development/concept-navigation.md) · [Living knowledge map](development/living-knowledge-map.md)
- **Review** — the health of your slip-box, the weekly review, the timeline of an idea.
  → [Slip-box health](development/slipbox-health-dashboard.md) · [Second-brain review](development/second-brain-review.md) · [Evolution timeline](development/evolution-timeline.md) · [Open questions](development/open-questions.md)
- **Think & cultivate** — make one idea evolve, think before it's knowledge, place a wager, collide two notes, re-judge a claim.
  → [Cultivate](development/cultivate.md) · [Think](architecture/thought-lab.md) · [A thought you can be wrong about](development/wagers.md) · [Two things far apart](architecture/collision.md) · [The return of a claim](development/claim-returns.md)
- **Automation** — react to vault events, run scripts on property changes.
  → [Property hooks](vault-hooks/property-hooks/overview.md) · [Folder automation](vault-hooks/OnCreate.md)
- **Scripting** — the `zf` API your scripts get, and a workbench to try them.
  → [Scripting](architecture/scripting.md) · [The script workbench](architecture/script-workbench.md) · [API reference](api/ZettelFlowAPI.md)
- **Community** — install a complete knowledge system in one click, or share your own.
  → [Systems gallery](how-to-contribute/systems-gallery.md)
- **Architecture** — how the plugin is built, layer by layer.
  → [Overview](architecture/overview.md) · [The four surfaces](architecture/surfaces.md) · [Reposition map](architecture/reposition-map.md)

---

## Resources

- [GitHub repository](https://github.com/RafaelGB/Obsidian-ZettelFlow)
- [Bug reports & feature requests](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues)
- [Discussions](https://github.com/RafaelGB/Obsidian-ZettelFlow/discussions)
- [Changelog / releases](https://github.com/RafaelGB/Obsidian-ZettelFlow/releases)
- [Manifesto](manifesto.md) · [Project roadmap](development/project-health-and-roadmap.md)

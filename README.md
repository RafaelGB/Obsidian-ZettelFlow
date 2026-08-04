
# ZettelFlow

[![GitHub release](https://img.shields.io/github/v/release/RafaelGB/Obsidian-ZettelFlow?style=for-the-badge&sort=semver)](https://github.com/RafaelGB/Obsidian-ZettelFlow/releases/latest)
[![Total downloads](https://img.shields.io/github/downloads/RafaelGB/Obsidian-ZettelFlow/total?style=for-the-badge)](https://github.com/RafaelGB/Obsidian-ZettelFlow/releases)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/RafaelGB?label=Sponsor&logo=GitHub%20Sponsors&style=for-the-badge)](https://github.com/sponsors/RafaelGB)

**ZettelFlow turns an Obsidian Canvas into a guided note-creation wizard.** Draw your workflow as a graph — steps as nodes, order as arrows — and the plugin walks you through it every time you create a note, filling in frontmatter, body content, dates, selectors, and more without you touching a template manually.

> **[Full documentation →](https://rafaelgb.github.io/Obsidian-ZettelFlow/)**

---

## How it works

```
Canvas file  ──►  ZettelFlow wizard  ──►  Note in your vault
(your workflow)   (step-by-step UI)      (frontmatter + body merged)
```

1. **Design** — Create a `.canvas` file. Each node is a step; arrows define the order. Mark one node as the root.
2. **Configure** — Right-click any canvas node → *Edit ZettelFlow step* to add actions (prompt, calendar, selector, tags…).
3. **Run** — Click the ribbon icon (or use the command) to open the wizard. ZettelFlow walks the canvas graph and builds the note.

![Canvas example](docs/resources/readme/Canvas-Sample.png)
![Wizard demo](docs/resources/readme/demogif.gif)

---

## Get started in 5 minutes

1. Install **ZettelFlow** from the Obsidian community plugin browser.
2. Create a `.canvas` file (e.g. `flows/daily-note.canvas`).
3. In **Settings → ZettelFlow**, set that canvas as the "new notes canvas".
4. Add a note file to the canvas, right-click it → *Create managed step*, enable **Root**.
5. Click the ZettelFlow ribbon icon — your first wizard run.

Stuck? Read the [Getting started guide](https://rafaelgb.github.io/Obsidian-ZettelFlow/) or open a [Discussion](https://github.com/RafaelGB/Obsidian-ZettelFlow/discussions).

![Install screenshot](docs/resources/readme/install-plugin.png)

---

## Features

| Feature | Description |
|---|---|
| **Canvas-based flows** | Use Obsidian's native canvas as the workflow engine — no custom DSL to learn. |
| **11 built-in actions** | Prompt, Number, Checkbox, Calendar, Selector, Dynamic selector, Tags, Backlink, CSS classes, Task management, Script. |
| **Conditional edges** | Label a canvas arrow `if: frontmatter.type === "meeting"` to branch the workflow at runtime. |
| **Dynamic templates** | Use `{{title}}`, `{{date}}`, `{{frontmatter.key}}`, `{{canvas.name}}` in step body templates. |
| **Live body preview** | See the rendered note body while editing a step's template (desktop). |
| **Vault hooks** | Trigger flows automatically on folder creation events or frontmatter property changes. |
| **Community templates** | Browse, install, and share flows, steps, and actions from the community browser. |
| **.zftemplate export/import** | Bundle a canvas and its step files into a single portable file to share with others. |
| **Notes history** | Sidebar leaf showing recently built notes with quick-open links. |
| **Mobile support** | Works on iOS and Android (`isDesktopOnly: false`). |

---

## Capabilities & privacy

ZettelFlow collects **no telemetry** and sends **no personal data or vault contents** anywhere. The plugin uses these capabilities:

- **File system (vault).** Reads canvas flow files and creates/edits notes. All access goes through Obsidian's `Vault` API — never a hardcoded path. Works on desktop and mobile.
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

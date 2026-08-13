# Systems Gallery

A **system** is a whole knowledge methodology you can install in **one click** — a ready-to-run
canvas plus its step notes, written straight into your vault. Systems are the fastest way to get
started with ZettelFlow: instead of a blank canvas you begin from a real workflow that already
composes the cognitive actions, so a note you create through a system lands **already related,
cross-checked, link-suggested and maturity-scored** against your own graph.

Systems ship in the unified [`.zftemplate`](../architecture/zftemplate-schema.md) format and install
from the **Community Templates** browser — see [Community resources](community-examples.md#5-systems-one-click).
Everything is **offline** (no network, no AI) and additive (nothing in your vault is removed).

## Install a system

1. Open the **Community Templates** browser (ZettelFlow ribbon → *Community templates*).
2. Select the **Systems** tab and click a system to preview it.
3. Choose an install folder (a per-system subfolder is suggested) and press **Install system**.
4. ZettelFlow writes the canvas and every step note, then opens the canvas — pick an entry point and go.

## Shipped systems

Each system offers several **independent entry points** on one canvas — pick the note type you want to create.

| System | Entry points | What lands on creation |
|---|---|---|
| **Academic research** | Literature note · Permanent note | claims extracted · candidate sources · contradictions flagged · maturity scored → connected permanent notes |
| **Zettelkasten v2** | Fleeting · Literature · Permanent | the permanent note is related, cross-checked, link-suggested and maturity-scored (the on-creation pattern) |
| **PARA v2** | Project · Area · Resource · Archive | each note lands in its PARA folder, tagged by category and connected with *find related* |
| **GTD** | Inbox capture · Next action · Project | a thought moves from capture to a context-tagged next action, connected with *find related* |
| **Reading** | Reading source · Reading note | highlights mined for claims and candidate sources; insights connected to your graph |
| **Writing** | Draft · Section · Review | drafts pull in related source notes; sections suggest connections; reviews surface contradictions |
| **Software architecture KB** | Decision record (ADR) · Component | new decisions are checked against existing ones for contradictions and linked to related decisions |

> Previews: each system shows a preview image in the browser. Previews currently ship as placeholders
> pending final artwork (tracked in issue #223) — the system itself is fully functional regardless.

## Author your own system

A system is a single `.zftemplate` JSON bundle: a `canvas` (a real `.canvas`) plus its `steps` (the
`.md` files with `zettelFlowSettings` frontmatter). To contribute one:

1. **Build it in Obsidian.** Compose a canvas whose step nodes are `.md` files carrying valid
   `zettelFlowSettings` frontmatter (the same frontmatter the Step Builder writes). Run the command
   **`ZettelFlow: Export current canvas as .zftemplate`** to produce the bundle.
2. **Use independent entry points, not a chain.** For a system that offers several note types, give
   each its own `root: true` step and leave the canvas **edges empty** — a chained child auto-advances
   and merges the notes into one. (See any shipped system under `docs/systems/`.)
3. **Stay offline.** Compose the graph-computing actions in an `onCreation` block (`find-related`,
   `suggest-link`, `find-contradiction`, `calculate-maturity`, `extract-claims`, `find-sources`).
   Do **not** use the AI actions (`classify`, `summarize`, `generate-questions`) — a shipped system
   must run with no network. Avoid actions whose value is a build-time-fixed target
   (`attach-source`, `create-semantic-relation`) — they are no-ops in a template; capture relations
   with `find-related`/`suggest-link` and a plain wikilink prompt instead.
4. **Quote YAML-unsafe values.** A prompt `placeholder`/`label` that starts with `[[`, `@`, `{`, `*`
   (or contains `: `) must be single-quoted, or the frontmatter fails to parse and the step is dropped.
5. **Catalog it.** Add the `.zftemplate` under `docs/systems/`, a sibling `<id>.png` preview, and a
   `template_type: "system"` row to `docs/main_template.json` (`ref` = the `.zftemplate` path).
6. **Validate.** `npm test` runs the validity harness (`shippedSystems.test.ts` + `catalog.test.ts`):
   every shipped system must parse, reference only registered non-AI actions, use YAML-safe frontmatter,
   and resolve its canvas file-nodes to real steps.

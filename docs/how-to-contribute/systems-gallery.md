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
Every system carries a **difficulty badge** in the browser — *easy* (a light workflow, few actions), *medium*
(more steps and the relation/research actions), *hard* (the full pipeline). Start easy and grow into the richer
systems; the on-creation cognitive work scales with the difficulty.

| System | Difficulty | Entry points | What lands on creation |
|---|---|---|---|
| **🎓 ZettelFlow tour** | easy | Guided note | a three-step guided walkthrough that teaches capture → develop → connect while you build a real note — the fastest way to learn the whole workflow |
| **Concept note** | easy | Concept note | the full treatment — related · contradictions · suggested links · maturity · thinking prompts · next move |
| **Daily journal** | easy | Daily journal | highlights · gratitude · tomorrow, connected to related days on creation |
| **Meeting notes** | easy | Meeting note | attendees/agenda/actions captured, tagged, stamped with a Zettel ID, linked to related meetings |
| **Inquiry** | easy | Open question | surfaces your other open questions, related notes and the claims you're implicitly making |
| **Reading** | medium | Reading source · Reading note | highlights mined for claims and candidate sources; insights connected to your graph |
| **GTD** | medium | Inbox capture · Next action · Project | a thought moves from capture to a context-tagged next action, connected with *find related* |
| **Writing** | medium | Draft · Section · Review | drafts pull in related source notes; sections suggest connections; reviews surface contradictions |
| **Zettelkasten v2** | medium | Fleeting · Literature · Permanent | the permanent note is related, cross-checked, link-suggested and maturity-scored (the on-creation pattern) |
| **Decision journal** | medium | Decision record | options · rationale · review date, Zettel ID, checked against earlier decisions for contradictions |
| **Academic research** | hard | Literature note · Permanent note | claims extracted · candidate sources · contradictions flagged · maturity scored → connected permanent notes |
| **PARA v2** | hard | Project · Area · Resource · Archive | each note lands in its PARA folder, tagged by category and connected with *find related* |
| **Software architecture KB** | hard | Decision record (ADR) · Component | new decisions are checked against existing ones for contradictions and linked to related decisions |

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
5. **Declare a difficulty.** Set a top-level `"difficulty": "easy" | "medium" | "hard"` on the bundle so
   the gallery shows the right badge — *easy* for a light workflow, *medium* once you add relation/research
   actions, *hard* for the full on-creation pipeline. Optional; omit it and the badge is simply hidden.
6. **Catalog it.** Add the `.zftemplate` under `docs/systems/`, a sibling `<id>.png` preview, and a
   `template_type: "system"` row to `docs/main_template.json` (`ref` = the `.zftemplate` path).
7. **Validate.** `npm test` runs the validity harness (`shippedSystems.test.ts` + `catalog.test.ts`):
   every shipped system must parse, reference only registered non-AI actions, use YAML-safe frontmatter,
   and resolve its canvas file-nodes to real steps.
8. **Publish.** The fastest in-app route: build the workflow on a canvas, run **ZettelFlow → Export
   current canvas as .zftemplate** (also in the *Open ZettelFlow* ribbon menu), then submit it through
   the community browser's **Add template** link. That closes the loop — your system in the gallery for
   everyone.

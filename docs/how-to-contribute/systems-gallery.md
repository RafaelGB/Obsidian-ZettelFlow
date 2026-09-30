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

Each system is a **drawn workflow** on one canvas: a single entry that branches — with real edges and
phase colours — to each note type it makes. Pick the flow, answer its questions, and it lands the note.
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
| **Weekly focus** | hard | Weekly focus | **the scripting showcase** — picks this week's idea from the ones that grew without your judgement and stamps the vault's state so next week has something to compare against; uses [`zf.knowledge`](../api/ZettelFlowAPI.md) |
| **Software architecture KB** | hard | Decision record (ADR) · Component | new decisions are checked against existing ones for contradictions and linked to related decisions |

> Previews: each system shows a preview image in the browser. Previews currently ship as placeholders
> pending final artwork (tracked in issue #223) — the system itself is fully functional regardless.

## Systems that run code

A system may ship a **Script** or **Dynamic selector** action, and those carry JavaScript that
ZettelFlow runs with access to your vault. Because systems install in one click from a remote catalog,
the install modal **says so before writing anything**: it names the steps that carry code and asks you
to acknowledge it. A system built from stock actions gains no extra step — there is nothing to disclose.

Conditional canvas edges (`if: …`) are *not* in that category: they are read by a pure parser with no
`eval`, so they are never reported as executable code.

If you author one, write the code as a YAML block scalar:

```yaml
  - type: script
    id: my-stamp
    hasUI: false
    code: |
      if (!zf.knowledge.ready()) return;
      content.addFrontMatter({ vault_debt: zf.knowledge.debt().score });
```

**Weekly focus** is the shipped example: it picks this week's idea from the ones that grew without your
judgement, using [`zf.knowledge`](../api/ZettelFlowAPI.md) — something no stock action can do.

## Author your own system

A system is a single `.zftemplate` JSON bundle: a `canvas` (a real `.canvas`) and its `steps`. The
reference pattern (see the three pilots — `zettelkasten-v2`, `para-v2`, `gtd`) is **fully inline**:
the steps live *on the canvas nodes*, not in external `.md` files, and `steps` is `[]`. To contribute one:

1. **Draw the flow with inline boxes.** Make each step a native **text** canvas node whose
   `zettelFlowSettings` live in its `zettelflowConfig` (the Step Builder writes this when you *Edit embed*
   an inline box), and give the step an inline `body` template. The canvas **is** the system — a reader
   should see the methodology in the drawing.
2. **One root, and branch with edges.** Give the system **one** `root: true` step and connect the rest
   with canvas **edges**. Model a decision as a **branch** — several edges out of one step, each gated by
   a `StepExit` keyed by the edge id (`when: frontmatter.<key> === "..."`, with a human `says`) — and set
   each step's `phase` so its canvas colour reads the arc at a glance. **One walk makes one note** (a
   *chain* merges its steps into a single note), so a choice between note types is a branch, never a chain.
3. **Stay offline, and don't auto-write a judgement (§XII).** On creation, auto-write only **mechanical**
   outputs: `find-related`, `calculate-maturity`, `detect-orphan`, `find-contradiction`,
   `find-unanswered-question`, `extract-claims`, `find-sources`, `compare-claims`. Do **not** auto-write
   the *interpretive* `suggest-link`/`suggest-next-move` — those are moves a human invokes, not silent
   writes. Never use an **AI action** (`classify`, `summarize`, `generate-questions`, `challenge-idea`,
   `synthesize`, `suggest-connections`): a shipped system runs with no network. Avoid build-time-fixed
   targets (`attach-source`, `create-semantic-relation`) — they are no-ops in a template.
4. **Quote YAML-unsafe values.** A prompt `placeholder`/`label` that starts with `[[`, `@`, `{`, `*`
   (or contains `: `) must be single-quoted, or the frontmatter fails to parse and the step is dropped.
5. **Declare a difficulty.** Set a top-level `"difficulty": "easy" | "medium" | "hard"` on the bundle so
   the gallery shows the right badge — *easy* for a light workflow, *medium* once you add relation/research
   actions, *hard* for the full on-creation pipeline. Optional; omit it and the badge is simply hidden.
6. **Catalog it.** Add the `.zftemplate` under `docs/systems/`, a sibling `<id>.png` preview, and a
   `template_type: "system"` row to `docs/main_template.json` (`ref` = the `.zftemplate` path).
7. **Validate.** `npm test` runs the validity harness. `shippedSystems.test.ts` + `catalog.test.ts`:
   every shipped system parses, references only registered **non-AI** actions, uses YAML-safe
   frontmatter, and resolves its canvas file-nodes to real steps — and now **lints the inline nodes too**
   (`validateSystemTemplate` walks each `zettelflowConfig`, rejecting unknown or AI actions). For a
   branched flow, `pilotFlows.test.ts` proves the shape (edges, one root), the §XII mechanical-only
   on-creation, no AI, the phase colours, and that each branch rehearses to exactly one outcome.
8. **Publish.** The fastest in-app route: build the workflow on a canvas, run **ZettelFlow → Export
   current canvas as .zftemplate** (also in the *Open ZettelFlow* ribbon menu), then submit it through
   the community browser's **Add template** link. That closes the loop — your system in the gallery for
   everyone.

_README vocabulary for this page: **Community Hub**, **Try a system before installing**._

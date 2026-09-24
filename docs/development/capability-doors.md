# Capability doors

Every capability this plugin has, and **how a person reaches it**.

The [reposition map](../architecture/reposition-map.md) answers the other question — what the
product can do, and which layer owns each piece. This page answers the one that decides whether a
feature gets used at all.

It exists because of a small, embarrassing measurement. *Think before you look* — the Thought Lab's
mechanic that asks what you expect before it shows you anything — was specified, built, documented
and shipped, and the person who asked for it **could not find it in their own vault**. It was not
buried. It was one `eye-off` button among ten identically weighted controls in one surface, and that
was enough.

## The five ranks

A door is how you arrive at a capability. They are not equivalent:

| rank | kind | what it is |
|---|---|---|
| 1 | `object` | a control on screen where you already are — the note's context menu, a button in the view showing the thing, the ribbon menu |
| 2 | `surface` | a surface, or a mode of one — Home, Explore, Health |
| 3 | `recommendation` | it comes to you: a line on Home that arrives without being looked for |
| 4 | `settings` | a settings row. For **configuring**, never for discovering |
| 5 | `command` | the palette. A hotkey and a re-entry point — never a discovery path |

Ranks 1–3 are **discovery**: you arrive without having been told the thing exists. Ranks 4 and 5 are
**re-entry**: useful to someone who already knows, useless to everyone else.

## The rule

> **Every capability has at least one door of rank 1–3.**

A capability whose only door is a command is a capability nobody discovers. The palette is where you
go looking for something you already know is there — which is exactly the population that does not
need help finding it.

And the line that keeps the rule from being argued away:

> **A capability is something you do to something.** If there is no object — no note, no selection,
> no question — and the thing is a standing rule the plugin follows while you are elsewhere, it is
> **configuration**, and settings is its home by design rather than by neglect.

Knowledge patterns and the vault hooks are configuration. Both have a name, a settings group and a
docs page; neither is something you *open*. Quick capture, deriving a project and the weekly review
all have an object, and all three got a real door instead of an exemption.

This is enforced, not encouraged. Two guardrails, in `test/config/capabilityDoors.test.ts`:

- **Guardrail A** — the rule above. Rows that fail today are carried in the `DOORLESS` register with
  the issue that fixes each, so the guardrail ships green; a row that *stops* failing and keeps its
  excuse also fails the build, so the register can only shrink.
- **Guardrail B** — every door **resolves**. A command against the registrations, a surface against
  `SURFACES`, a ribbon entry against the ribbon's own table, a settings row against the locale, a
  control against the filesystem. A registry claiming *the collision is a control in the Lab* is
  worth nothing once the Lab renderer moves.

## Adding a capability

`src/architecture/components/core/surface/capabilities.ts` is a closed vocabulary. Add the id to
`CAPABILITIES` and TypeScript refuses to compile until it has an entry in `CAPABILITY_DOORS` — a
name key, an owner, and at least one door. Then:

1. **Give it a name in both locales.** A capability with no name a person could read is not one, and
   that definition is what stops this list becoming a second copy of the module list.
2. **Give it a rank 1–3 door in the same change.** Not "later" — later is what produced this page.
   If the door genuinely cannot ship yet, `DOORLESS` takes the row with an issue number, and that
   issue is the commitment.
3. **Regenerate the table below** (`capabilityAuditTable()`), which `capabilityAudit.test.ts`
   compares against this page.

A command is still worth registering — a hotkey is a real convenience, and the retired views' ids
are kept on purpose so a binding never breaks (§XI). It just is not a door.

## The audit

Generated from the registry. Do not edit by hand — `capabilityAudit.test.ts` will tell you.
A ⚠️ marks a row failing guardrail A, carried by the register.

<!-- generated: capabilityAudit -->

| capability | owner | depth | doors, best first |
|---|---|---|---|
| `note-creation` | workflow | 1 | ribbon → `open-workflow` · `open-workflow` |
| `run-a-flow` | workflow | 1 | ribbon → `run-canvas-flow` · `run-canvas-flow` · `editor-menu-flow` |
| `canvas-editing` | workflow | 1 | ribbon → `open-canvas` · settings → `settings_group_creating` · `open-canvas` |
| `quick-capture` | zettelflow-home | 1 | control in zettelflow-home (`HomeModeRenderer.ts`) · `quick-capture` |
| `home` | zettelflow-home | 1 | ribbon → `show-home` · surface `zettelflow-home:home` · `show-home` |
| `moc-builder` | zettelflow-explore | 1 | control in zettelflow-explore (`AskGraphRenderer.ts`) · `build-map-of-content` |
| `derive-project` | projects | 1 | note menu (`DeriveProjectComponent.ts`) · `derive-project` |
| `knowledge-map` | zettelflow-explore | 2 | surface `zettelflow-explore:explore` · `show-knowledge-map` |
| `concept-nav` | zettelflow-explore | 2 | surface `zettelflow-explore:explore` · `show-concept-nav` |
| `explore` | zettelflow-explore | 1 | ribbon → `ask-your-graph` · surface `zettelflow-explore:explore` · `ask-your-graph` |
| `graph-lens` | zettelflow-explore | 1 | control in zettelflow-explore (`AskGraphRenderer.ts`) · `explore-in-3d` · `show-graph` |
| `reasoning-paths` | zettelflow-health | 1 | control in zettelflow-health (`EvolutionTimelineRenderer.ts`) · `explore-reasoning-paths` |
| `slipbox-health` | zettelflow-health | 1 | ribbon → `show-health` · surface `zettelflow-health:health` · `show-slipbox-health` |
| `knowledge-dashboard` | zettelflow-health | 2 | surface `zettelflow-health:health` · `show-knowledge-dashboard` |
| `weekly-review` | zettelflow-health | 1 | control in zettelflow-health (`SlipboxHealthRenderer.ts`) · `generate-weekly-review` |
| `thinking-heatmap` | zettelflow-health | 2 | surface `zettelflow-health:momentum` · `show-thinking-heatmap` |
| `evolution-timeline` | zettelflow-health | 2 | surface `zettelflow-health:timeline` · `show-evolution-timeline` · `show-notes-history` |
| `evidence-map` | zettelflow-health | 2 | surface `zettelflow-health:timeline` · `show-evidence-map` |
| `open-questions` | zettelflow-home | 2 | surface `zettelflow-home:home` · `show-open-questions` |
| `resurface` | zettelflow-home | 3 | recommended on `zettelflow-home:home` · `resurface-related-notes` · `show-discoveries` · `show-discovery` |
| `atomicity-split` | thinking | 1 | note menu (`MoveCommandsComponent.ts`) · `split-note-into-atomic-notes` |
| `cultivate` | zettelflow-home | 1 | ribbon → `cultivate` · surface `zettelflow-home:cultivate` · `cultivate` |
| `inquiry` | zettelflow-home | 1 | control in zettelflow-home (`CultivateModeRenderer.ts`) |
| `thought-lab` | zettelflow-home | 1 | ribbon → `think` · surface `zettelflow-home:lab` · `think` |
| `blind-ask` | zettelflow-explore | 1 | control in zettelflow-explore (`AskGraphRenderer.ts`) |
| `collision` | zettelflow-home | 1 | control in zettelflow-home (`LabRenderer.ts`) · note menu (`MoveCommandsComponent.ts`) |
| `moves` | thinking | 1 | note menu (`MoveCommandsComponent.ts`) · control in zettelflow-home (`CultivateModeRenderer.ts`) |
| `think-about` | zettelflow-home | 1 | note menu (`ThinkAboutComponent.ts`) · `think-about-this-note` |
| `claim-door` | claims | 1 | note menu (`ClaimDoorComponent.ts`) · control in zettelflow-home (`CultivateModeRenderer.ts`) |
| `claim-return` | claims | 3 | recommended on `zettelflow-home:home` · `return-to-this-claim` |
| `wager` | claims | 1 | note menu (`ClaimDoorComponent.ts`) · recommended on `zettelflow-home:home` |
| `agency-review` | zettelflow-health | 2 | surface `zettelflow-health:agency` |
| `note-state` | lifecycle | 1 | control in zettelflow-home (`CultivateModeRenderer.ts`) · `change-note-state` |
| `remove-relation` | relations | 1 | note menu (`RemoveRelationComponent.ts`) · `remove-relation` |
| `script-workbench` | scripting | 1 | control in editor (`CodeView.ts`) · `open-script-workbench` |
| `systems-gallery` | community | 1 | ribbon → `browse-systems` · `browse-systems` · `open-community-templates` |
| `template-export` | community | 1 | ribbon → `export-canvas-template` · `export-canvas-template` |
| `template-import` | community | 1 | ribbon → `import-canvas-template` · `import-canvas-template` |
| `manage-templates` | community | 1 | ribbon → `open-manage-templates` · settings → `settings_group_creating` · `open-manage-templates` |

<!-- generated: capabilityAudit -->

## What the first measurement said, and what happened to it

[#575](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/575) measured forty-one capabilities
and found **eleven** — better than one in four — with no door above a settings row. Eight of the
eleven sat at rank 5: the command palette and nowhere else.

They were not the ten the plan predicted, and the difference is the interesting part. The plan
counted *command-only ids*; the registry counts *capabilities*. Opening the canvas turned out to
have a settings row and the 3D graph a lens control, so both dropped off — while knowledge patterns
and the vault hooks, which have **no command at all** and so were never scanned for, took their
places. A capability with no command was invisible even to the audit looking for invisible
capabilities.

[#578](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/578) emptied the register:

| | outcome | where it is now |
|---|---|---|
| capture a thought | door | the primary control of Home's header |
| generate the weekly review | door | the primary control of Health's header |
| open the canvas | door | the ribbon's systems group |
| import a system | door | the ribbon's systems group |
| manage installed systems | door | the ribbon's systems group |
| derive a project | door | the **folder's** context menu — a project is derived from a folder |
| change a note's state | door | the state chip on Cultivate's target card, which is where the state already was |
| remove a relation | door | the note's menu, on notes that have one |
| trace a reasoning path | **merge** | the per-note mode, which already answers per-note questions |
| knowledge patterns | not a capability | configuration; settings is its home by design |
| vault hooks | not a capability | configuration; settings is its home by design |

**Nothing was deleted.** Every one of the nine was a thing a person would want; what they lacked was
a way in. What the epic actually removed is duplication and litter: a second query engine (the blind
panel's hand-rolled matcher, [#576](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/576)),
one dead stylesheet, and seventeen off-grid pixels that went on the grid while their block moved
house.

## What a table cannot see

*Think before you look* — the mechanic that started the epic, the one its author could not find in
their own vault — **passed guardrail A from the first measurement**. Its `eye-off` button really was
"a control in the view showing it": rank 1, by the letter of the rule.

That is not a hole in the guardrail. It is the guardrail being honest about what a static registry
can know. A door existed; it was not *visible*, because it was one of ten identically weighted
controls in one header. No table will ever measure that, which is why
[#576](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/576) (move it where you ask) and
[#577](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/577) (one primary action per header)
had to be argued rather than asserted — and why the [surfaces page](../architecture/surfaces.md)
carries the header rule beside this one.

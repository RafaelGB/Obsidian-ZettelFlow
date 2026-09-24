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
| `canvas-editing` | workflow | 4 | settings → `settings_group_creating` · `open-canvas` ⚠️ #578 — the ribbon, beside the flow it edits |
| `quick-capture` | zettelflow-home | 5 | `quick-capture` ⚠️ #578 — a control in Home's header |
| `home` | zettelflow-home | 1 | ribbon → `show-home` · surface `zettelflow-home:home` · `show-home` |
| `moc-builder` | zettelflow-explore | 1 | control in zettelflow-explore (`AskGraphRenderer.ts`) · `build-map-of-content` |
| `derive-project` | projects | 5 | `derive-project` ⚠️ #578 — the folder's context menu |
| `knowledge-map` | zettelflow-explore | 2 | surface `zettelflow-explore:explore` · `show-knowledge-map` |
| `concept-nav` | zettelflow-explore | 2 | surface `zettelflow-explore:explore` · `show-concept-nav` |
| `explore` | zettelflow-explore | 1 | ribbon → `ask-your-graph` · surface `zettelflow-explore:explore` · `ask-your-graph` |
| `graph-lens` | zettelflow-explore | 1 | control in zettelflow-explore (`AskGraphRenderer.ts`) · `explore-in-3d` · `show-graph` |
| `reasoning-paths` | zettelflow-explore | 5 | `explore-reasoning-paths` ⚠️ #578 — merged into Explore's graph lens, which already traces routes |
| `slipbox-health` | zettelflow-health | 1 | ribbon → `show-health` · surface `zettelflow-health:health` · `show-slipbox-health` |
| `knowledge-dashboard` | zettelflow-health | 2 | surface `zettelflow-health:health` · `show-knowledge-dashboard` |
| `weekly-review` | zettelflow-health | 5 | `generate-weekly-review` ⚠️ #578 — a control in Health |
| `thinking-heatmap` | zettelflow-health | 2 | surface `zettelflow-health:momentum` · `show-thinking-heatmap` |
| `evolution-timeline` | zettelflow-health | 2 | surface `zettelflow-health:timeline` · `show-evolution-timeline` · `show-notes-history` |
| `evidence-map` | zettelflow-health | 2 | surface `zettelflow-health:timeline` · `show-evidence-map` |
| `knowledge-patterns` | workflow | 4 | settings → `settings_patterns_heading` ⚠️ #578 — a control where a pattern actually runs |
| `open-questions` | zettelflow-home | 2 | surface `zettelflow-home:home` · `show-open-questions` |
| `resurface` | zettelflow-home | 3 | recommended on `zettelflow-home:home` · `resurface-related-notes` · `show-discoveries` · `show-discovery` |
| `atomicity-split` | thinking | 1 | note menu (`MoveCommandsComponent.ts`) · `split-note-into-atomic-notes` |
| `cultivate` | zettelflow-home | 1 | ribbon → `cultivate` · surface `zettelflow-home:cultivate` · `cultivate` |
| `inquiry` | zettelflow-home | 1 | control in zettelflow-home (`CultivateModeRenderer.ts`) |
| `thought-lab` | zettelflow-home | 1 | ribbon → `think` · surface `zettelflow-home:lab` · `think` |
| `blind-ask` | zettelflow-home | 1 | control in zettelflow-home (`LabRenderer.ts`) |
| `collision` | zettelflow-home | 1 | control in zettelflow-home (`LabRenderer.ts`) · note menu (`MoveCommandsComponent.ts`) |
| `moves` | thinking | 1 | note menu (`MoveCommandsComponent.ts`) · control in zettelflow-home (`CultivateModeRenderer.ts`) |
| `think-about` | zettelflow-home | 1 | note menu (`ThinkAboutComponent.ts`) · `think-about-this-note` |
| `claim-door` | claims | 1 | note menu (`ClaimDoorComponent.ts`) · control in zettelflow-home (`CultivateModeRenderer.ts`) |
| `claim-return` | claims | 3 | recommended on `zettelflow-home:home` · `return-to-this-claim` |
| `wager` | claims | 1 | note menu (`ClaimDoorComponent.ts`) · recommended on `zettelflow-home:home` |
| `agency-review` | zettelflow-health | 2 | surface `zettelflow-health:agency` |
| `note-state` | lifecycle | 5 | `change-note-state` ⚠️ #578 — the note's move picker |
| `remove-relation` | relations | 5 | `remove-relation` ⚠️ #578 — the note's move picker |
| `script-workbench` | scripting | 1 | control in editor (`CodeView.ts`) · `open-script-workbench` |
| `systems-gallery` | community | 1 | ribbon → `browse-systems` · `browse-systems` · `open-community-templates` |
| `template-export` | community | 1 | ribbon → `export-canvas-template` · `export-canvas-template` |
| `template-import` | community | 5 | `import-canvas-template` ⚠️ #578 — the ribbon's systems group, beside export |
| `manage-templates` | community | 4 | settings → `settings_group_creating` · `open-manage-templates` ⚠️ #578 — the ribbon's systems group |
| `vault-hooks` | hooks | 4 | settings → `settings_group_automation` ⚠️ #578 — reachable from the flow whose events it binds |

<!-- generated: capabilityAudit -->

## What the first measurement said

Forty-one capabilities. **Eleven** of them — better than one in four — have no door above a settings
row, and eight of those eleven sit at rank 5: the command palette and nowhere else.

The eleven are not the ten the plan predicted, and the difference is the interesting part. The plan
counted *command-only ids*; the registry counts *capabilities*. Opening the canvas turns out to have
a settings row and the 3D graph a lens control, so both drop off — while knowledge patterns and the
vault hooks, which have no command at all and so were never scanned for, take their places. **A
capability with no command was invisible even to the audit looking for invisible capabilities.**

Note also what *passes*. *Think before you look*, the mechanic that started the epic, sits at
**depth 1** — its `eye-off` button really is "a control in the view showing it", by the letter of
the rule. That is not a hole in the guardrail; it is the guardrail being honest about what a static
registry can see. A door exists. It is not *visible*, and no table will ever know the difference —
which is why [#576](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/576) and
[#577](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/577) are the part of this epic that
has to be argued rather than asserted.

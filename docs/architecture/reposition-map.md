# Reposition map — every feature → its home layer

ZettelFlow grew organized by *mechanism*. This map re-frames the whole codebase around the
architecture it now stands for — the **five layers** of the Knowledge OS (epic #144), plus a
**Foundation** bucket for genuinely cross-cutting infrastructure:

**Knowledge Model · Workflow Engine · Knowledge State · Experience · Community Gallery** (+ Foundation).

> **The rule: keep every feature, reposition it — nothing is deleted or renamed.** This is a *map*,
> not a move. Every `src/` area below appears **exactly once**. The actual folder moves land as small,
> `verify`-green follow-up PRs (see the roadmap at the end); the *target layer* column is the home a
> capability belongs to, not a path that exists today.

## Knowledge Model — the pure, Obsidian-free model of your ideas

| Capability | Today's path |
|---|---|
| The idea graph, incremental index & queries | `architecture/knowledge/{model,parse,derive,query}` |
| Relations & claims/sources vocabulary | `architecture/knowledge/{relations,claims}` |
| Lifecycle states | `architecture/knowledge/lifecycle` |
| The Obsidian→model feed (index service + snapshot) | `architecture/knowledge/{KnowledgeIndex,snapshot}` |

## Workflow Engine — turning a canvas into a note

| Capability | Today's path |
|---|---|
| Plugin bootstrap, ribbon, command/view registration | `main.ts`, `starters/` |
| The action framework (ActionsStore, `CustomZettelAction`, `zf` script API) | `architecture/api` |
| The 28 built-in actions + shared helpers | `actions/*` |
| Note-builder engine core (assembly, preview, condition eval, context tokens) | `application/notes/{NoteBuilder,previewAssembly,conditionEvaluator,contextTokens}` |
| Knowledge Patterns (on-creation behavior) | `application/patterns` (#170) |
| Template resolution | `application/template` |
| The note-builder wizard (Zustand) + its UI parts | `application/components/noteBuilder/*` |
| Step/flow authoring modals, mappers, phases | `zettelkasten/*` |
| Canvas integration, workflow triggers/wait, events, write-services | `architecture/plugin/{canvas,workflow,events,services}` |
| Vault hooks (folder automation, property hooks, context menus) | `hooks/*` |

## Knowledge State — analyses *over* the model

| Capability | Today's path |
|---|---|
| Health: debt · review · balance | `architecture/knowledge/{debt,review,balance}` (#159/#160/#161) |
| Discovery: morning discoveries · living map | `architecture/knowledge/{discovery,map}` (#163/#164) |
| Graph: reasoning paths · concept navigation | `architecture/knowledge/traverse` (#166) |
| Open questions & answer detection | `architecture/knowledge/questions` (#167) |
| Evolution timeline · development journal (recorders) | `architecture/knowledge/{timeline,journal}` + `architecture/plugin/{timeline,journal}` (#162/#168) |
| Compound thinking / evidence map | `architecture/knowledge/synthesis` (#169) |
| Ops-console dashboard · Home aggregate · derived projects | `architecture/knowledge/{dashboard,home,projects}` (#171/#172/#173) |
| Note-builder state helpers (atomicity, connections, MOC, resurface, weekly-review render, history) | `application/notes/{atomicitySplit,connectionSuggestions,mocMembership,mocMerge,resurfaceRanking,weeklyReviewMarkdown,historyUtils}` |

## Experience — how you *see and act on* the system

| Capability | Today's path |
|---|---|
| The 13 sidebar views (health, discoveries, map, heatmap, concept-nav, open-questions, timeline, evidence-map, dashboard, Home, …) + CodeView | `architecture/components/core/*` |
| View/command/ribbon registrars | `starters/zcomponents/*` |
| Settings tab + declarative handlers | `config/modals`, `config/modals/ZettelFlowSettingsTab` |
| Settings primitives + shared UI (icon, navbar) | `architecture/components/settings`, `components/icon` |

## Community Gallery — sharing whole systems

| Capability | Today's path |
|---|---|
| Community browser + backend client | `application/community/*`, `backend/` |
| Starter flows | `application/notes/starterFlowsService`, `starters/zcomponents/StarterFlowsComponent` (#157) |
| Methodology packages | `application/packages`, `starters/zcomponents/MethodologyPackageComponent` (#174) |
| Onboarding · template export/share | `application/notes/onboardingService`, `architecture/share`, `TemplateExportComponent` |

## Foundation — cross-cutting infrastructure (home-agnostic)

| Capability | Today's path |
|---|---|
| i18n (en/es) | `architecture/lang` |
| Styles (SCSS) + `c()` prefixer | `architecture/styles`, `src/styles` |
| Logging & exceptions | `architecture/monitoring` |
| Patterns (AbstractChain) & shared typing | `architecture/patterns`, `architecture/typing` |
| Optional AI provider layer (#156) | `architecture/ai` |
| The Obsidian facade (`ObsidianApi`, `Lifecycle`) | `architecture/plugin` (facade) |
| Settings model & defaults | `config/typing` |

## The `src/` move roadmap (follow-up PRs)

The actual folder moves are **out of scope for this map PR** and land incrementally, leaf-first, each
keeping `npm run verify` and `lint:obsidian` green — tracked as a single follow-up (linked to #144):
State analyses → Model → Experience views → Actions → note-builder → authoring → plugin services →
Gallery → Foundation → bootstrap. No feature is deleted; nothing is renamed as part of a move except
its containing folder.

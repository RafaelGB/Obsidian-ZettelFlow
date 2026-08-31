# Friction audit (epic #231, Phase 0)

> **Purpose.** Map ZettelFlow's entire user-facing surface to the *job* each element does, flag every
> overlap, and propose the **one primary path** per job. This is the evidence base for the
> [*"one obvious path"* epic (#231)](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/231); every
> later phase should cite a row here.
>
> **Stance: consolidate & hide.** Per the [manifesto](../manifesto.md), *"keep every feature — reposition
> it; almost nothing is deleted."* Nothing below is a proposal to delete a capability — only to expose
> one obvious path and tuck duplicates out of the way.

>
> **Two different "frictions" — do not confuse them.** This page is about **operational friction**:
> duplicated paths, unclear entry points, steps that cost the user effort for no thinking in return. That
> kind is removed. **Deliberate (cognitive) friction** — asking for your reading before the system reveals
> its own — is the opposite: it is *added* on purpose where judgement is at stake
> ([constitution §XII](constitution.md), [manifesto](../manifesto.md)).

## Method

Counted from source on `main`: `addCommand` ids, `registerView` names, the community catalog types,
`DEFAULT_SETTINGS`, and the single ribbon action. No behavior changed by this document.

## 1. Entry points

| Surface | Count | Reality |
|---|---|---|
| Ribbon | 1 | One all-in-one **"Open ZettelFlow"** button; its menu leads with **Create note** and lists the surfaces (#271). Note-creation is also a hotkey-bindable command (`open-workflow`). |
| Sidebar views | 13 | Reachable from the one ribbon menu (#231) and each `show-*` command; opened as main-area **tabs** (#270). |
| Commands | ~23 | ~12 are just `show-<a-view>`; the rest are actions + install paths. |

> **Update (#268 Phase 7):** the two ribbon icons were unified into one all-in-one button (#271), views now open as normal tabs (#270), and the ~12 sidebar views are being collapsed into 4 surfaces with modes (#272). This section describes the pre-consolidation baseline.

**Finding F1.** The 13 views have *no discoverable entry point* — a user must know 12 command names.
→ Phase 2: **Home** becomes the front door that surfaces/links them.

## 2. Sidebar views — the "understand my knowledge" cluster

| View (command) | The question it answers | Overlaps |
|---|---|---|
| `home` (`show-home`) | "Where do I start today? what's next?" | **superset** of dashboard + resurface + open-questions |
| `knowledge-dashboard` (`show-knowledge-dashboard`) | "What's the state of my system? what next?" | Home, slipbox-health |
| `slipbox-health` (`show-slipbox-health`) | "Orphans, dead-ends, knowledge debt, balance" | dashboard, Home |
| `knowledge-map` (`show-knowledge-map`) | "What are my hubs/clusters?" | concept-nav (both graph views) |
| `concept-nav` (`show-concept-nav`) | "Walk my graph by typed relation" | knowledge-map |
| `discoveries` (`show-discoveries`) | "Surprising connections to make" | **resurface** (both surface connections) |
| `resurface` (`resurface-related-notes`) | "Older related notes worth revisiting" | **discoveries** |
| `open-questions` (`show-open-questions`) | "Every unanswered question" | Home (a Home panel already) |
| `evolution-timeline` (`show-evolution-timeline`) | "How did this idea evolve?" | — (distinct, per-note) |
| `evidence-map` (`show-evidence-map`) *(experimental)* | "Grounded synthesis of a note" | — (distinct) |
| `thinking-heatmap` (`show-thinking-heatmap`) | "Momentum — ideas developed over time" | — (distinct cadence) |
| `history` (`show-notes-history`) | "Recently built notes" | — (utility) |

**Finding F2 (biggest surface win).** `home` + `knowledge-dashboard` + `slipbox-health` all answer
"what's my state / what next." → Phase 2: **merge the three into Home + one Health panel**; keep every
metric as a Home section.
**Finding F3.** `discoveries` + `resurface` both surface connections. → Phase 3: **one Discovery view.**
**Finding F4 (minor).** `knowledge-map` + `concept-nav` are two graph explorers; candidates to unify as
two modes of one Graph view (lower priority).

## 3. Adopt-a-workflow — five overlapping paths (the onboarding-friction cluster)

| Path | What it installs | UX | Overlap |
|---|---|---|---|
| Community **flow** tab | a flow, via **clipboard → paste on canvas** | 2-hop, clunky | **superseded by systems** |
| Community **system** tab (#213) | a `.zftemplate` = canvas + steps, **one click** | one click | the canonical path |
| ~~`install-starter-flows`~~ | the 4 classic note-type flows + a composed showcase | command | **removed** — superseded by systems |
| ~~`install-methodology-package`~~ | a bundle of flows (the Zettelkasten package) | command | **removed** — superseded by systems |
| `import-canvas-template` | a local `.zftemplate` from disk | command (desktop) | same format as systems |

**Finding F5 (highest ROI — the #74 pain).** Five ways to "get a workflow." → Phase 1: **Systems Gallery
is the one adoption path**; present starter flows + the package *as systems*, retire the clipboard
**flow** tab (kept viewable/legacy), fold the two install commands into the gallery. First-run nudges a
system.

## 4. Community browser resource types

`step` · `action` · `markdown` · `flow` · `system`. **`flow` is now redundant with `system`** (F5). The
other three are fragments (compose a flow) and stay. → Phase 1 hides/retires the `flow` tab.

## 5. Actions — the honest-set cluster

The action registry is grouped by capability (#152: Manipulation · Relations · Knowledge · Research ·
AI). Two are **no-ops when authored into a template** because their target is a build-time-fixed note
path that a shipped template can't know:

| Action | Why it's a no-op in a template |
|---|---|
| `create-semantic-relation` | `target` is fixed at authoring time; empty ⇒ writes nothing |
| `attach-source` | reads a static `source`; empty ⇒ writes nothing |

**Finding F6.** These are offered in the picker but silently do nothing in a shipped system. → Phase 4:
make them **interactive-only** or drop them from the offline-authorable set. (The deterministic
`find-related`/`suggest-link` + the new `remove-relation` command cover the real relation jobs.)

## 6. Step configuration — dual format

| Format | Where | Status |
|---|---|---|
| `.md` frontmatter `zettelFlowSettings` (file-node steps) | modern; what the Systems Gallery + export use | **canonical** |
| Inline canvas node `zettelflowConfig` (text/group nodes) | legacy inline config | dual-path complexity; root of #226 |

**Finding F7.** Two config sources → maintenance cost + the hot-reload bug (#226, config not refreshed
when the `.canvas` changes). → Phase 5: standardize on frontmatter, deprecate inline.

## 7. Settings surface

`DEFAULT_SETTINGS` toggles, by audience:

| Setting | Default | Audience |
|---|---|---|
| `ribbonCanvas` / `editorCanvas` | "" | **beginner-critical** (the flow won't run until set — the #74 wall) |
| `events.enabled` | off | advanced |
| `ai.*` | off | advanced (AI is one action, never required — manifesto) |
| `timeline.enabled` | off | advanced |
| `journal.enabled` | on | benign (path-free counts) |
| `relations.parseInlineRelations` | runtime (desktop on / mobile off) | advanced |
| `lifecycle.*Property` | state/created/last-reviewed | advanced (no lock-in) |
| `uniquePrefix*`, `jsLibraryFolderPath`, `foldersFlowsPath`, `createInCurrentFolder` | see defaults | mixed |

**Finding F8.** The one setting that *blocks first use* (`ribbonCanvas`) sits among many advanced
toggles with equal weight. → Phase 6: sane defaults + first-run that sets the canvas by installing a
system; group advanced toggles under "Advanced."

## 8. Consolidation summary (the plan, one row per cluster)

| Cluster | Today | One primary path (consolidate & hide) | Phase |
|---|---|---|---|
| Adopt a workflow | 5 paths | **Systems Gallery** (one click) | 1 |
| Observability | home + dashboard + slipbox-health | **Home** + one Health panel | 2 |
| Discovery | discoveries + resurface | **one Discovery view** | 3 |
| Graph explore | knowledge-map + concept-nav | one Graph view (two modes) | 2/later |
| Relation actions | + 2 template no-ops | interactive-only / hidden | 4 |
| Step config | frontmatter + inline | **frontmatter** only | 5 |
| Settings | flat toggles | defaults + Advanced group | 6 |

Nothing above is deleted — each duplicate keeps working, just no longer competes for the front door.

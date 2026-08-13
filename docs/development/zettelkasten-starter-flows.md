# Zettelkasten starter flows

Zettelkasten starter flows give newcomers **ready-made, runnable flows** for the four classic
note types — plus a **composed showcase** flow — instead of building a canvas from scratch. Each
starter is a complete ZettelFlow flow: a canvas whose single file node points at a step markdown
file carrying valid `zettelFlowSettings` frontmatter (the same contract as the onboarding example
flow).

## Installing

Run the command **"Install Zettelkasten starter flows"** from the command palette — or click
**Install** next to *Starter flows* in **Settings → ZettelFlow → Zettelkasten toolkit**. A picker
opens with a toggle per note type; enable the ones you want and click **Install selected**. A single
notice reports how many flows were installed and how many were skipped.

## The four note types

| Type | Captures | Prompts |
|---|---|---|
| **Fleeting note** | A quick thought before it escapes. | title |
| **Literature note** | A digested source. | title, source, author, page, summary |
| **Permanent note** | One atomic idea and its connections. | title, idea, connect |
| **Structure note (MOC)** | An index that links related notes. | title, about |

Each flow targets `_ZettelFlow/examples/notes`; step files live under
`_ZettelFlow/examples/steps` and the canvases sit in `_ZettelFlow/examples`.

## Literature → Permanent (composed showcase)

A fifth starter, **Literature → Permanent**, shows the engine's power by **composing the cognitive
actions** (#153–#156) into one flow — it is assembled from the existing actions, not hard-coded, so
every step is an independent, removable entry in the step's `actions` list. In order:

1. **Input** — `title`, `source`, `summary` prompts (it starts life as a literature note).
2. **Extract concepts** — `extract-claims` (🔍) surfaces the claims + sources the note declares.
3. **Find related** — `find-related` (🔗) ranks notes worth linking (top 10).
4. **Suggest connections** — `suggest-link` (🔗) surfaces the strongest link suggestions (top 5).
5. **Identify contradictions** — `find-contradiction` (🧠) lists notes that contradict it.
6. **Maturity signal** — `calculate-maturity` (🧠) scores how developed the note is.
7. **Promote to Permanent** — a static, no-UI step writes `state: permanent`.

**Human review** is the wizard's own preview: the wizard walks the canvas and previews the note
before creating it, so you approve the result — no separate confirmation step is needed.

**Fully offline by default.** The composed flow uses only deterministic, offline actions, so it
works out of the box for everyone. If you [enable AI](ai-provider-setup.md), you can add the opt-in
🤖 actions (e.g. summarize, generate questions) as extra removable steps.

Notes worth knowing:

- The cognitive actions read the note's position in your knowledge graph, so on a **brand-new,
  not-yet-indexed note** they safely surface empty results until the note has connections — the
  flow is an editable showcase of the composition.
- The promotion writes the default lifecycle property `state`. If you renamed
  `lifecycle.stateProperty`, edit the installed example step to match.

## Idempotent — never overwrites

Installation only ever **creates** files:

- If both a type's canvas **and** its step file already exist, the type is **skipped** and nothing
  is written.
- Otherwise the missing file(s) are created and the type is reported as **installed**.
- The service never calls `modify` — existing user files (including customised canvases) are never
  touched. Running the command repeatedly is safe.

## Architecture

```
StarterFlowsComponent (PluginComponent)
  registers "install-starter-flows" command (no default hotkey)
  opens StarterFlowsModal

StarterFlowsModal (Modal)
  toggle per note type (Setting.addToggle), "Install selected" button
  calls installStarterFlows(app.vault, selected) → one summary Notice

starterFlowsService.ts (pure, no Obsidian imports, unit-tested)
  STARTER_FLOW_PATHS — canvas + step path per type
  installStarterFlows(vault, types) → { installed, skipped }
  emits log.info once per created flow
```

`installStarterFlows` accepts a minimal `StarterFlowVault` interface (a subset of Obsidian's
`Vault`) so the install logic can be unit-tested with a mock vault.

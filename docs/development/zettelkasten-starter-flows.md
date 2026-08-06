# Zettelkasten starter flows

Zettelkasten starter flows give newcomers **ready-made, runnable flows** for the four classic
note types instead of building a canvas from scratch. Each starter is a complete ZettelFlow flow:
a canvas whose single file node points at a step markdown file carrying valid
`zettelFlowSettings` frontmatter (the same contract as the onboarding example flow).

## Installing

Run the command **"Install Zettelkasten starter flows"** from the command palette. A picker opens
with a toggle per note type; enable the ones you want and click **Install selected**. A single
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

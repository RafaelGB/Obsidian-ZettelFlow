# Mobile support

ZettelFlow ships `isDesktopOnly: false` (manifest) — it runs on **iOS and Android**. This page records
the mobile-parity audit (epic #246, C2) so you know exactly what to expect.

## Clean by construction

The audit found **no mobile-breaking APIs** in `src/`: nothing imports Node modules (`fs`, `path`,
`os`, `child_process`, `electron`) and nothing reads `process.*`. Everything goes through the Obsidian
API and the `ObsidianApi` facade, so it loads on mobile without a shim.

## Fully supported on mobile

- Creating notes through a flow (the ribbon **Create a new Zettel Note**, and **Run the current canvas
  as a flow**).
- **Community** — browse the systems and install one in one click, then *Create a note* from the
  notice.
- The surfaces and their modes — **Home** (Home · Cultivate · Think), **Health** (Tend · Practice),
  **Explore** — and the **This note** companion all render on mobile.
- Lifecycle state changes, semantic relations, the offline cognitive actions, and property hooks.

## Desktop-only, by design (guarded with `Platform`)

These degrade gracefully on mobile (hidden or skipped), never crash:

- **Companion pane** (live preview + connection suggestions while the wizard runs) — folds into a
  section you open on a phone, instead of sitting beside the questions.
- **Live body preview** in the step editor.
- **`.zftemplate` export and import** (`Export current canvas as .zftemplate`, `Import .zftemplate`)
  — they use a browser download and a file picker, so both register on desktop only. The Systems
  room of Community installs systems on mobile too.
- Inline `key:: [[X]]` relation parsing defaults **off** on mobile (a deferred whole-vault pass);
  frontmatter relations are always parsed.

## If you hit a mobile issue

Open an issue with your platform + Obsidian version. Because the surface is Obsidian-API-only, most
mobile problems are layout, not capability — and layout fixes are cheap.

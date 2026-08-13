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
- **Browse systems** and one-click **install → Run now** from the community browser.
- The knowledge views — Home, Discovery, knowledge dashboard, slip-box health, open questions, concept
  navigation, timeline, heatmap — all render in the mobile sidebar.
- Lifecycle state changes, semantic relations, the offline cognitive actions, and property hooks.

## Desktop-only, by design (guarded with `Platform`)

These degrade gracefully on mobile (hidden or skipped), never crash:

- **Companion pane** (live preview + connection suggestions while the wizard runs) — hidden on mobile.
- **Live body preview** in the step editor.
- **`.zftemplate` export** (`ZettelFlow: Export current canvas as .zftemplate`) — uses a browser
  download, desktop only. Import + the community Systems Gallery still work on mobile.
- Inline `key:: [[X]]` relation parsing defaults **off** on mobile (a deferred whole-vault pass);
  frontmatter relations are always parsed.

## If you hit a mobile issue

Open an issue with your platform + Obsidian version. Because the surface is Obsidian-API-only, most
mobile problems are layout, not capability — and layout fixes are cheap.

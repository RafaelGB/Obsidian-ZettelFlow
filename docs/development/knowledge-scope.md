# Knowledge scope (excluded paths)

Not everything in a vault is *knowledge*. Config folders, template libraries, attachments-as-notes
and other tooling are just files that happen to live next to your thinking. **Knowledge scope**
(#311) lets you keep them out of the thinking system entirely.

## What it does

Add folders under **Settings → ZettelFlow → Knowledge scope → Excluded folders**. It is a small CRUD:
each excluded folder is one row with a remove button, and you add a new one from a **folder
autosuggest** (add/remove, no free-text list). Every note whose path is under an excluded folder
**never enters the index** — so it drops out of *every* mechanism at once:

- the **3D graph** and the living knowledge map
- **slip-box health**, knowledge debt and balance
- **discovery**, open questions, evidence maps
- **Cultivate** sessions and **Home** (recommendations, next session, counts)
- maturity, the thinking heatmap, the weekly review — everything downstream of the model

It is **one filter, by subtraction**: because excluded notes never become ideas, no individual view
needs to know about the setting.

## How matching works

Each entry is a **folder-boundary "starts with"** match. `templates` excludes `templates/note.md`,
`templates/sub/deep.md` and the note `templates.md` — but **not** `templates-other/…`. Leading/
trailing slashes and back-slashes are normalised, values are **Unicode-normalised to NFC**, and blanks
and duplicates dropped. Adding or removing a folder rebuilds the index **and refreshes any open Home /
Cultivate surface immediately**.

Because you add folders from the autosuggest, the stored value is the **exact** `folder.path` Obsidian
uses — which is what fixes a class of silent no-ops (#374): a folder named with emoji, spaces or
accents typed into a free-text box rarely byte-matches the real path (variation selectors, ZWJ,
Unicode form), so the old open-list exclusion matched nothing. Picking the folder removes that gap
entirely; the NFC step covers any remaining accented-name mismatch.

## System folders are excluded automatically

ZettelFlow's **own machinery** is never part of your thinking, so it is excluded **automatically** —
you don't have to list it. That covers the flows folder (`foldersFlowsPath`, default
`_ZettelFlow/folders`), the hook-flow folder (`hooks.folderFlowPath`, default `_ZettelFlow/hooks`)
and the `zf` JS library folder (`jsLibraryFolderPath`). Their step notes and scripts therefore never
get indexed, cultivated, or counted anywhere. Your manual list is merged on top of these.

## Notes

- A link **from** an in-scope note **to** an excluded note is tolerated (the target simply isn't a
  node); it won't resurrect the excluded note into the graph.
- Excluding a path doesn't move or change any file — it only changes what the knowledge system reads.

## Architecture

The pure predicate lives in `architecture/knowledge/scope/knowledgeScope.ts`
(`isPathExcluded` / `normalizeExcludedPaths`), with `scopeExcludedPaths(settings)` merging the user's
`excludedPaths` with the auto-excluded system folders. It is applied at the single boundary in
`KnowledgeIndex.inScope` (`build` / `upsert` / `enrichInlineRelations` / `onRename`). Settings:
`ZettelFlowSettings.excludedPaths` (+ `foldersFlowsPath`, `hooks.folderFlowPath`, `jsLibraryFolderPath`).

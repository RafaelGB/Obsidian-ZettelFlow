# Plan: Migrate inline styles to CSS classes

- **Spec:** [spec.md](spec.md)
- **Status:** Approved
- **Owner:** implementation-planner

## Approach

Replace each inline `el.style.*` with the project's `c()`-prefixed CSS classes toggled via the
Obsidian DOM API (`addClass`/`removeClass`/`toggleClass`/`hasClass`). For the two dynamic
node-colour borders, use `el.setCssProps({ "--zf-node-color": rgb(...) })` and a class whose SCSS
reads that custom property (the rule endorses `setCssProps` for dynamic values). Reuse the
existing `.zettelkasten-flow__is-hidden` utility; add small utilities for the static cases.

## Files touched

| File | Layer | Change |
|---|---|---|
| `src/application/community/CommunityFlowModal.tsx` | application | download button show/hide, image fit, node/edge colour via `setCssProps`, accordion open/close → classes |
| `src/application/components/select/Select.tsx` | application | search input show → `is-visible` class |
| `src/actions/taskManagement/TaskManagementSettings.tsx` | actions | key setting show/hide → class toggles |
| `src/zettelkasten/modals/InstalledActionEditorModal.ts` | zettelkasten | textarea width + settingEl block → classes |
| `src/zettelkasten/modals/handlers/CommunityInfoHandler.ts` | zettelkasten | same as above |
| `src/styles/main.scss` | styles | `display-block`, `fill-available`, `flow-image-fit`, `select-group input.is-visible` |
| `src/styles/components/community.scss` | styles | `flow-node-has-color` border from `--zf-node-color` |

## Obsidian score impact (constitution §I)

- Rule `obsidianmd/no-static-styles-assignment` — **−12** (all cleared). No new violations; the
  `setCssProps` calls are the rule's own recommended replacement. Expected `lint:obsidian` delta:
  **−12 errors**.

## Test strategy (constitution §II)

This is a DOM/styling refactor with no unit-testable pure logic; there is no jest-testable seam
(the components render inside Obsidian). Verification is the linter (AC-1/AC-2) + `npm run verify`
(AC-3) + a manual smoke of the community modal accordion and the selector search box. No mock
changes needed.

## i18n impact (constitution §IV)

None — no UI strings change.

## Docs impact (constitution §VIII)

None — internal styling only. (Roadmap M2 checkbox flips when the issue closes.)

## Rollout & rollback

Ships in the normal build. Rollback = revert the commit; classes are additive so no data/migration
concerns.

## Risks

Low. The only visible-behaviour risk is a show/hide element returning to its natural `display`
(flex for setting-items) instead of the previous forced `block`; mitigated by a `display-block`
utility that preserves the exact prior rendering where it mattered.

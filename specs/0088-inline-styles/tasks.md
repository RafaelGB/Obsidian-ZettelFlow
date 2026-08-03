# Tasks: Migrate inline styles to CSS classes

- **Plan:** [plan.md](plan.md)

## Tasks

- [x] **T1 — Add the CSS utilities** (covers FR-2)
  - Green: add `display-block`, `fill-available`, `flow-image-fit`, `select-group input.is-visible`
    to `main.scss`; add `flow-node-has-color` (border from `--zf-node-color`) to `community.scss`.
  - Guardrail: build/sass compiles via `npm run verify`.

- [x] **T2 — Migrate the two settings modals** (FR-1)
  - Green: `InstalledActionEditorModal.ts` + `CommunityInfoHandler.ts` → `fill-available` +
    `display-block` classes.
  - Guardrail: `lint:obsidian` on those files clean.

- [x] **T3 — Migrate TaskManagementSettings + Select** (FR-1/FR-2)
  - Green: class toggles for the key setting and the search input.
  - Guardrail: `lint:obsidian` clean.

- [x] **T4 — Migrate CommunityFlowModal** (FR-1/FR-2/FR-3)
  - Green: download button, image fit, node/edge colour via `setCssProps`, accordion toggle.
  - Guardrail: `lint:obsidian` clean; manual smoke of the modal.

- [x] **T5 — Verify & commit** (AC-1/AC-2/AC-3)
  - Guardrail: `rg "\.style\.\w+\s*=" src` empty; `lint:obsidian` no-static-styles-assignment = 0;
    `npm run verify` green.
  - Commit: `refactor(styles): migrate inline el.style.* to CSS classes (#88)`

## Definition of done

- [x] All tasks done; AC-1/AC-2/AC-3 verified; docs n/a; issue closed.

# Spec: Burn down eslint-plugin-obsidianmd and make it blocking

- **Issue:** #85
- **Status:** In progress
- **Milestone / label:** obsidian-score / M1-compliance
- **Owner:** spec-author

## Problem

`npm run lint:obsidian` (the official Obsidian rule set + typescript-eslint type-checked rules) is
wired **advisory** (`continue-on-error: true` in CI) with a backlog of ~380 problems. Until it is
clean and blocking, regressions can slip in and the Obsidian score stays suppressed.

## Value

A clean, **blocking** guideline lint is the strongest guardrail for the Obsidian quality score and
overall robustness. Decision (recorded): a **full burn-down to zero errors** — fix each finding
properly, do **not** downgrade rules to `warn` or set a soft threshold.

## Functional requirements

- **FR-1** — Reduce `npx eslint "src/**"` to **0 errors** (warnings may remain but are also driven
  down where practical).
- **FR-2** — Fixes preserve behavior; every step keeps `npm run verify` green and CI green.
- **FR-3** — Once at 0 errors, remove `continue-on-error: true` from the `lint:obsidian` CI step so
  it is **blocking**.

## Acceptance criteria

- **AC-1** — `npx eslint "src/**/*.{ts,tsx}"` exits 0 (no errors).
- **AC-2** — `.github/workflows/ci.yml` runs `npm run lint:obsidian` without `continue-on-error`.
- **AC-3** — `npm run verify` green; no behavior regressions.

## Capability disclosure (constitution §VII)

- [x] None — code-quality only.

## Out of scope

- Fixing the `no-fallthrough` latent bug in `CallbackUtils.tsx` (flagged for separate review).

## Open questions

- `obsidianmd/prefer-get-language` needs `minAppVersion ≥ 1.8.7` (currently 1.7.2) — bump considered
  in a later part.

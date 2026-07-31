# Plan: Capability disclosures

- **Spec:** [spec.md](spec.md)
- **Status:** Approved
- **Owner:** implementation-planner

## Approach

Documentation-only change. Add a "Capabilities & privacy" section to `README.md` (the surface
Obsidian's community page renders) and a mirrored `docs/` page in the nav. Derive the claims from
the actual code paths, not assumptions.

## Files touched

| File | Layer | Change |
|---|---|---|
| `README.md` | docs | new "Capabilities & privacy" section before Support |
| `docs/development/capabilities-and-privacy.md` | docs | new page mirroring the disclosure + future-label note |
| `mkdocs.yml` | docs | nav entry under Development |

## Obsidian score impact (constitution §I)

None directly (no code). Pre-empts the upcoming disclosure-label manual-review flag; can only help.
Expected `npm run lint:obsidian` delta: 0.

## Test strategy (constitution §II)

No code paths; not unit-testable. Verification is review against the real capabilities:
- File system: `Vault` reads/writes (note creation, canvas read, template install).
- Network: `src/application/community/services/CommunityHttpClientService.ts` + `requestUrl` image
  fetch in `CommunityFlowModal`; only exercised by the opt-in community feature.
- Script execution: the `script` action and `.js` step files (`CodeView`) run user JavaScript.

## i18n impact

None (README/docs are English project docs).

## Docs impact (constitution §VIII)

This change IS the docs. `mkdocs.yml` nav updated.

## Rollout & rollback

Docs ship on push to `main` (documentation workflow). Rollback = revert the commit.

## Risks

Only risk is an inaccurate claim; mitigated by deriving each line from a real code path.

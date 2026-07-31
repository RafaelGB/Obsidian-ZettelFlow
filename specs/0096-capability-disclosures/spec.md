# Spec: Capability disclosures

- **Issue:** #96
- **Status:** Done
- **Milestone / label:** obsidian-score / M5-product
- **Owner:** spec-author

## Problem

Obsidian's Community hub is adding **capability disclosure labels** (network / file system /
clipboard / script execution). ZettelFlow accesses the file system, optionally the network (the
community feature), and executes user-authored scripts — but none of this is disclosed to users
before install.

## Value

Getting ahead of the disclosure labels builds trust and pre-empts a manual-review flag. Users see,
before installing, exactly what the plugin can do and that there is no telemetry.

## Functional requirements

- **FR-1** — The README has a clear "Capabilities & privacy" section listing every capability the
  plugin uses and confirming no telemetry / no data collection.
- **FR-2** — A docs page mirrors the disclosure and is in the `mkdocs.yml` nav.
- **FR-3** — Disclosures are accurate: file-system (always), network (community feature only,
  opt-in), script execution (Script action + `.js` step files run user code).

## Acceptance criteria

- **AC-1** — README contains a "Capabilities & privacy" section covering file-system, network, and
  script-execution, and an explicit "no telemetry" statement.
- **AC-2** — `docs/development/capabilities-and-privacy.md` exists and is referenced in `mkdocs.yml`.
- **AC-3** — No capability is claimed that the code does not use, and none that it does use is omitted.

## Capability disclosure (constitution §VII)

- [x] File-system access · [x] Network (community, opt-in) · [x] Script execution — this spec IS
  the disclosure.

## Out of scope

- Adopting Obsidian's machine-readable disclosure manifest format — it hasn't shipped yet; tracked
  as a follow-up in the docs page.

## Open questions

None.

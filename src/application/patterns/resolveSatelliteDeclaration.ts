import type { StepSettings } from "zettelkasten";
import type { SatelliteDeclaration } from "application/notes/satellitePlan";

/**
 * The **satellite declaration** a step carries (#419) — the linked note it also creates.
 *
 * Mirrors `resolveOnCreationActions` (#170): a step that declares nothing yields `undefined`, so a
 * legacy template behaves byte-identically. Pure, and deliberately **not** a validator: whatever was
 * authored is handed over as-is, because repairing a declaration silently would hide the defect that
 * `validateSatellite` exists to report.
 */
export function resolveSatelliteDeclaration(
    settings: StepSettings
): SatelliteDeclaration | undefined {
    return settings.satellite;
}

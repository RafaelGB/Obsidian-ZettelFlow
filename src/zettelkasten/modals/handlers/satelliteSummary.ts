import {
    SatelliteDeclaration,
    SatelliteError,
    validateSatellite,
} from "application/notes/satellitePlan";

/**
 * What the step editor shows about a linked-note declaration (#419, FR-12) — pure.
 *
 * The declaration is authored in YAML/frontmatter in v1, exactly like `trigger`, `wait` and
 * `onCreation`. What the editor adds is the thing those three lack: it **states the defect at
 * authoring time** instead of letting the build discover it. The plugin must not manufacture the
 * knowledge debt its own Health surface then reports, so an empty template is caught here.
 *
 * Returns locale **keys**, not text: the renderer translates, and the model stays testable.
 */

export interface SatelliteSummaryRow {
    /** Locale key for the row label. */
    label: string;
    /** The declared value, or a locale key when there is nothing to show. */
    value: string;
}

export interface SatelliteSummary {
    rows: SatelliteSummaryRow[];
    error?: SatelliteError;
}

const MISSING = "satellite_summary_missing";

export function satelliteSummary(
    declaration: SatelliteDeclaration | undefined
): SatelliteSummary | undefined {
    if (!declaration) return undefined;

    const rows: SatelliteSummaryRow[] = [
        {
            label: "satellite_summary_template",
            value: declaration.template?.trim() || MISSING,
        },
        {
            label: "satellite_summary_title",
            value: declaration.title?.trim() || MISSING,
        },
        {
            label: "satellite_summary_folder",
            value: declaration.targetFolder?.trim() || "satellite_summary_folder_inherited",
        },
        {
            label: "satellite_summary_relation",
            value: declaration.relation
                ? `${declaration.relation.type} (${declaration.relation.direction})`
                : MISSING,
        },
    ];

    const error = validateSatellite(declaration);
    return error ? { rows, error } : { rows };
}

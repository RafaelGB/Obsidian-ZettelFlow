import {
    SatelliteDeclaration,
    SatelliteDirection,
    SatelliteError,
    validateSatellite,
} from "application/notes/satellitePlan";

/**
 * What the step editor's **linked note** form binds to (#419) — pure.
 *
 * The first cut of this feature was authored in YAML, following the precedent of `trigger`, `wait`
 * and `onCreation`. That precedent was a symptom, not a justification: nobody hand-edits a config
 * block to use a feature, however well documented it is. The manifesto now says so as a norm
 * (*power you can reach*) and the constitution as a gate (§XIII) — so the capability is authored
 * from a form, and the YAML is simply what the form writes.
 *
 * Pure so the form's behaviour is testable without a modal: state in, declaration out.
 */

export interface SatelliteFormState {
    enabled: boolean;
    template: string;
    title: string;
    folder: string;
    type: string;
    direction: SatelliteDirection;
    /** The defect to show inline, if any. Only meaningful while enabled. */
    error?: SatelliteError;
}

/**
 * Defaults that already work: the canonical literature → permanent pairing. Only the template is
 * left for the author to choose, because only they know which one it is.
 */
export const DEFAULT_SATELLITE: SatelliteDeclaration = {
    template: "",
    title: "{{title}} — idea",
    relation: { type: "inspired-by", direction: "satellite-to-main" },
};

/** The form's state for a step, whether or not it declares a linked note. */
export function satelliteFormState(
    declaration: SatelliteDeclaration | undefined
): SatelliteFormState {
    const source = declaration ?? DEFAULT_SATELLITE;
    const state: SatelliteFormState = {
        enabled: declaration !== undefined,
        template: source.template ?? "",
        title: source.title ?? "",
        folder: source.targetFolder ?? "",
        type: source.relation?.type ?? DEFAULT_SATELLITE.relation.type,
        direction: source.relation?.direction ?? DEFAULT_SATELLITE.relation.direction,
    };
    if (!declaration) return state;

    const error = validateSatellite(declaration);
    return error ? { ...state, error } : state;
}

/**
 * The declaration a form state represents — `undefined` when the toggle is off, which is what
 * clears the step's linked note.
 *
 * An incomplete state still produces a declaration rather than silently dropping the author's
 * work; the form shows the defect and the build refuses to write it.
 */
export function satelliteFromForm(state: SatelliteFormState): SatelliteDeclaration | undefined {
    if (!state.enabled) return undefined;
    const folder = state.folder.trim();
    return {
        template: state.template.trim(),
        title: state.title.trim(),
        ...(folder ? { targetFolder: folder } : {}),
        relation: { type: state.type, direction: state.direction },
    };
}

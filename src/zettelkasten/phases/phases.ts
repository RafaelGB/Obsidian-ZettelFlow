/**
 * The canonical knowledge-transformation phases a Step can advance (#149). A phase is a
 * Workflow-Engine concept that lives on a Step — orthogonal to the note lifecycle *state* (#146):
 * a Step has a **phase**, a note has a **state**. Purely additive & cosmetic in #149 (it labels
 * and groups steps in the builder; it does not drive execution or ordering). Absence of a phase
 * means "unphased". Pure & Obsidian-free.
 */

export type StepPhase =
    | "CAPTURE"
    | "CLASSIFY"
    | "PROCESS"
    | "CONNECT"
    | "DEVELOP"
    | "REVIEW"
    | "CONSOLIDATE";

/** The seven phases, in canonical order — the arc a piece of knowledge travels. */
export const STEP_PHASES: readonly StepPhase[] = [
    "CAPTURE",
    "CLASSIFY",
    "PROCESS",
    "CONNECT",
    "DEVELOP",
    "REVIEW",
    "CONSOLIDATE",
] as const;

export function isStepPhase(value: unknown): value is StepPhase {
    return typeof value === "string" && (STEP_PHASES as readonly string[]).includes(value);
}

/** i18n key of each phase's sentence-case label. Pure data; the `t()` lookup is in impure layers. */
export const PHASE_LABEL_KEY = {
    CAPTURE: "step_phase_capture_label",
    CLASSIFY: "step_phase_classify_label",
    PROCESS: "step_phase_process_label",
    CONNECT: "step_phase_connect_label",
    DEVELOP: "step_phase_develop_label",
    REVIEW: "step_phase_review_label",
    CONSOLIDATE: "step_phase_consolidate_label",
} as const;

/** i18n key of each phase's sentence-case description. */
export const PHASE_DESCRIPTION_KEY = {
    CAPTURE: "step_phase_capture_desc",
    CLASSIFY: "step_phase_classify_desc",
    PROCESS: "step_phase_process_desc",
    CONNECT: "step_phase_connect_desc",
    DEVELOP: "step_phase_develop_desc",
    REVIEW: "step_phase_review_desc",
    CONSOLIDATE: "step_phase_consolidate_desc",
} as const;

/** A group of options that share a phase; `phase: null` is the trailing "unphased" group. */
export interface PhaseGroup<T> {
    phase: StepPhase | null;
    options: T[];
}

/**
 * Group options by their `phase` in canonical order, with the unphased group last. Returns `null`
 * when NO option carries a phase, signalling the caller to render a flat list — so a fully-legacy
 * (unphased) flow looks visually identical (AC-1).
 */
export function groupOptionsByPhase<T extends { phase?: StepPhase }>(
    options: T[]
): PhaseGroup<T>[] | null {
    if (!options.some((option) => isStepPhase(option.phase))) return null;

    const groups: PhaseGroup<T>[] = [];
    for (const phase of STEP_PHASES) {
        const inPhase = options.filter((option) => option.phase === phase);
        if (inPhase.length) groups.push({ phase, options: inPhase });
    }
    const unphased = options.filter((option) => !isStepPhase(option.phase));
    if (unphased.length) groups.push({ phase: null, options: unphased });
    return groups;
}

/**
 * Merge a step's settings into an existing frontmatter `zettelFlowSettings` object, DELETING the
 * optional-marker keys (`phase` #149, `wait` #151) when the incoming settings carry none. The
 * file-node save path spreads `{ ...existing, ...incoming }`, which would otherwise leave a
 * previously-saved marker behind when the user clears it in the builder. Pure & unit-tested.
 */
export function mergeStepSettingsIntoFrontmatter(
    existing: Record<string, unknown> | undefined,
    incoming: Record<string, unknown>
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing, ...incoming };
    if (incoming.phase === undefined) delete merged.phase;
    if (incoming.wait === undefined) delete merged.wait;
    return merged;
}

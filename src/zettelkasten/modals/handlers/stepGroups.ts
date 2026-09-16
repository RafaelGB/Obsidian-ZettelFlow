import type { StepBuilderInfo } from "zettelkasten";

/**
 * The step editor, organised by **questions** (#425, epic #422) — pure.
 *
 * Eleven settings used to render in one flat list, in whatever order the handler chain happened to
 * be linked: the two you touch every time sat between five you touch once a year, all at the same
 * visual weight.
 *
 * The chain itself is worth keeping — it is how a handler skips itself (root-only, editor-only). So
 * this changes *where* each `Setting` lands, not who builds it, and the mapping is **data** so a new
 * handler cannot quietly land outside the structure (a test asserts completeness).
 */

export const STEP_GROUPS = ["asks", "writes", "when", "where", "shown", "leads"] as const;
export type StepGroupId = (typeof STEP_GROUPS)[number];

/** Sentence-case question per group; the renderer translates. */
export const STEP_GROUP_HEADING: Record<StepGroupId, string> = {
    asks: "step_group_asks",
    writes: "step_group_writes",
    when: "step_group_when",
    where: "step_group_where",
    shown: "step_group_shown",
    leads: "step_group_leads",
};

/**
 * Which group each handler writes into. Keyed by class name so the test can walk the chain and
 * prove every handler is placed exactly once.
 */
export const HANDLER_GROUP: Record<string, StepGroupId> = {
    ActionManagementHandler: "asks",
    SatelliteHandler: "writes",
    RootToggleHandler: "when",
    StepTriggerHandler: "when",
    StepWaitHandler: "when",
    OptionalToggleHandler: "when",
    TargetFolderSuggesterHandler: "where",
    StepTitleHandler: "shown",
    StepSectionLabelHandler: "shown",
    PhaseSelectorHandler: "shown",
    ChildrenHeaderHandler: "shown",
    CommunityInfoHandler: "shown",
};

/**
 * Whether a group opens on load. *What it asks* and *what it writes* always do — they are the
 * reason you opened the editor. The rest open only when they hold something, so a configured
 * trigger is never hidden from the person who configured it.
 */
export function isGroupExpanded(group: StepGroupId, info: StepBuilderInfo): boolean {
    switch (group) {
        case "asks":
        case "writes":
            return true;
        case "when":
            return Boolean(info.root || info.trigger || info.wait || info.optional);
        case "where":
            return Boolean(info.targetFolder?.trim());
        case "shown":
            return Boolean(info.label?.trim() || info.phase || info.childrenHeader?.trim());
        case "leads":
            // Open when the step already decides something about where it goes; otherwise the
            // arrows speak for themselves and the section is one heading you can ignore.
            return Object.keys(info.exits ?? {}).length > 0;
    }
}

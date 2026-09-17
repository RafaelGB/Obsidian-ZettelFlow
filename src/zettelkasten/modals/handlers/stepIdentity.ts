import { classifyNodeBlock, type WorkflowBlockKind } from "architecture/plugin/workflow";
import type { StepBuilderInfo } from "zettelkasten";
import type { StepPhase } from "zettelkasten/phases";

/**
 * What the step editor is editing (#424, epic #422) — pure.
 *
 * The dialog used to open with the constant *"ZettelFlow step builder"*, identical for a root step
 * that fires on a vault event and for a leaf that asks one question, on a canvas with fifteen nodes.
 * You found out what you had opened three fields down.
 *
 * This is the projection behind the header: what it is called, what kind of node it lives on, what
 * is switched on, and — in plain language — what it actually does. Derived, never stored, and it
 * returns locale **keys** so the model stays translation-free and testable.
 */

export interface SummaryFragment {
    key: string;
    /** Interpolated into the fragment when it carries a number or a path. */
    value?: string;
}

export interface StepIdentity {
    /** The step's own name, when it has one. */
    title?: string;
    /** Locale key used instead, when it does not. */
    titleKey?: string;
    /** Which kind of node the step lives on. */
    kindKey: string;
    /** The #151 block vocabulary — one taxonomy, not two. */
    block: WorkflowBlockKind;
    phase?: StepPhase;
    /** What is switched on, in a stable order. */
    badges: string[];
    /** What the step does, in plain language. */
    summary: SummaryFragment[];
    /** There is a canvas node to go back to. */
    canReveal: boolean;
}

const KIND_KEYS: Record<string, string> = {
    text: "step_identity_kind_inline",
    group: "step_identity_kind_group",
    file: "step_identity_kind_note",
};

export function stepIdentity(info: StepBuilderInfo): StepIdentity {
    const name = info.label?.trim() || info.filename?.trim() || "";
    const asks = (info.actions ?? []).filter((action) => action.hasUI !== false).length;
    const background =
        (info.actions ?? []).filter((action) => action.hasUI === false).length +
        (info.onCreation ?? []).length;
    const hasTemplate = Boolean(info.body?.trim());

    const badges: string[] = [];
    if (info.root) badges.push("step_identity_badge_root");
    if (info.trigger) badges.push("step_identity_badge_trigger");
    if (info.wait) badges.push("step_identity_badge_wait");
    if (info.optional) badges.push("step_identity_badge_optional");
    if (info.satellite) badges.push("step_identity_badge_satellite");

    const summary: SummaryFragment[] = [];
    if (asks > 0) summary.push({ key: "step_identity_asks", value: String(asks) });
    if (hasTemplate) summary.push({ key: "step_identity_applies_template" });
    if (info.satellite) summary.push({ key: "step_identity_linked_note" });
    if (background > 0) {
        summary.push({ key: "step_identity_background", value: String(background) });
    }
    if (info.targetFolder?.trim()) {
        summary.push({ key: "step_identity_writes_to", value: info.targetFolder.trim() });
    }
    // An honest empty state: a step with nothing on it does nothing, and saying so is kinder than
    // an empty line that looks like a rendering bug.
    if (summary.length === 0) summary.push({ key: "step_identity_does_nothing" });

    return {
        ...(name ? { title: name } : { titleKey: "step_identity_untitled" }),
        kindKey: KIND_KEYS[info.type] ?? "step_identity_kind_unknown",
        block: classifyNodeBlock(info),
        ...(info.phase ? { phase: info.phase } : {}),
        badges,
        summary,
        canReveal: Boolean(info.nodeId),
    };
}

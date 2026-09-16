import type { StepSettings } from "zettelkasten";

/**
 * What applying an installed template would change (#428 FR-7, epic #422) — pure.
 *
 * *Apply installed template* overwrote a configured step behind a single confirm, with no preview:
 * the one sentence it showed said nothing about what was about to be lost. This compares the step
 * as it stands with the template as it arrives and names each difference, so the confirmation is
 * about something.
 */

export interface TemplateChange {
    /** i18n key of the field's sentence-case name. */
    fieldKey: string;
    /** What the step says now, already rendered as a short string. */
    before: string;
    /** What the template would make it say. */
    after: string;
}

/** A step-settings subset both sides share; everything is optional because a template may omit it. */
export type TemplateComparable = Partial<
    Pick<
        StepSettings,
        | "label"
        | "childrenHeader"
        | "targetFolder"
        | "actions"
        | "phase"
        | "root"
        | "optional"
        | "body"
        | "satellite"
    >
>;

/** The empty string stands for "nothing"; the caller renders it as a dash. */
function text(value: string | undefined): string {
    return value?.trim() ?? "";
}

function flag(value: boolean | undefined): string {
    return value ? "yes" : "";
}

export function describeTemplateChanges(
    current: TemplateComparable,
    incoming: TemplateComparable
): TemplateChange[] {
    const changes: TemplateChange[] = [];
    const compare = (fieldKey: string, before: string, after: string) => {
        if (before !== after) changes.push({ fieldKey, before, after });
    };

    compare("apply_template_field_label", text(current.label), text(incoming.label));
    compare(
        "apply_template_field_children",
        text(current.childrenHeader),
        text(incoming.childrenHeader)
    );
    compare("apply_template_field_target", text(current.targetFolder), text(incoming.targetFolder));
    compare(
        "apply_template_field_actions",
        String((current.actions ?? []).length),
        String((incoming.actions ?? []).length)
    );
    compare("apply_template_field_phase", text(current.phase), text(incoming.phase));
    compare("apply_template_field_root", flag(current.root), flag(incoming.root));
    compare("apply_template_field_optional", flag(current.optional), flag(incoming.optional));
    // The body and the linked note are compared by presence: quoting a template at someone in a
    // confirmation dialog is noise, and "it will be replaced" is the fact that matters.
    compare(
        "apply_template_field_body",
        flag(Boolean(current.body?.trim())),
        flag(Boolean(incoming.body?.trim()))
    );
    compare(
        "apply_template_field_satellite",
        flag(Boolean(current.satellite)),
        flag(Boolean(incoming.satellite))
    );

    return changes;
}

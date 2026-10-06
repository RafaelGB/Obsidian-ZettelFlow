/**
 * The words beside a checkbox (#684): the label the step's author wrote, else the property it
 * writes — the step's heading already says the rest. `undefined` only when the action has neither,
 * and the caller then says something generic. Never a box with nothing next to it.
 */
export function checkboxText(action: { label?: unknown; key?: unknown }): string | undefined {
    return [action.label, action.key].find(
        (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0
    );
}

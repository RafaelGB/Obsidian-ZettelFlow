import React from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { ConfirmStepType } from "./typing";

/**
 * **The control that ends a step** (#547) — one of them, for every action the wizard can ask.
 *
 * There were six: two in this folder (the calendar's, which validated, and the checkbox's, which
 * handled `Enter`, neither doing what the other did) and four written inline in the actions, which
 * did neither. So `Enter` advanced a prompt and did nothing in tags, and after three steps the
 * honest strategy was to click everything.
 *
 * It is Obsidian's primary button, not one of ours: **`mod-cta`**, which the modals elsewhere in
 * the plugin already use and the wizard never did. A theme paints it, because the user's theme
 * wins ([§XV](../../../../../docs/development/constitution.md)).
 *
 * What it owns, so that no step can be built without them:
 *
 * - the **accelerator** — `Enter`, or `Ctrl`/`Cmd`+`Enter` where a bare `Enter` belongs to the text
 *   box itself, and the hint says which;
 * - the **refusal** — an optional check that marks the group invalid and does not call back, the
 *   way the calendar already refused a bad date, said beside the control rather than in a `Notice`;
 * - the **hint**, one line, so a promised shortcut is never a promise the interface breaks.
 */
export function ConfirmStep(props: ConfirmStepType) {
    const { onConfirm, canConfirm, label, hint, tooltip, accelerator = "enter", autoFocus } = props;
    const [invalid, setInvalid] = React.useState(false);

    const confirm = (): void => {
        if (canConfirm && !canConfirm()) {
            setInvalid(true);
            return;
        }
        setInvalid(false);
        onConfirm();
    };

    const hintText = hint ?? (accelerator === "enter" ? t("confirm_hint_enter") : t("confirm_hint_mod_enter"));

    return (
        <div className={c("confirm-step", invalid ? "confirm-step--invalid" : "")}>
            <button
                // Obsidian's primary action. The wizard used a bare `<button>`, so the flagship
                // flow was the one place the main action did not look like the app's main action.
                className="mod-cta"
                onClick={confirm}
                title={tooltip}
                autoFocus={autoFocus}
                onKeyDown={(event) => {
                    if (event.key === "Enter") confirm();
                }}
            >
                {label ?? t("component_confirm")}
            </button>
            <span className={c("confirm-step-hint")}>{hintText}</span>
        </div>
    );
}

/**
 * Whether a keystroke inside a step's own field means *confirm*.
 *
 * Pure, and exported, because every component needs the same answer and a copy of this condition
 * is how `Enter` came to mean four different things. A single-line field confirms on `Enter`; a
 * text area cannot, because there `Enter` is a newline the writer wanted.
 */
export function confirmsOn(
    event: { key: string; metaKey: boolean; ctrlKey: boolean },
    accelerator: "enter" | "mod-enter" = "enter"
): boolean {
    if (event.key !== "Enter") return false;
    return accelerator === "enter" ? !event.metaKey && !event.ctrlKey : event.metaKey || event.ctrlKey;
}

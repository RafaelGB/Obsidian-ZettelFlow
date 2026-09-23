/** What the control that ends a step needs to know (#547). */
export type ConfirmStepType = {
    /** Called when the step is confirmed and {@link ConfirmStepType.canConfirm} allowed it. */
    onConfirm: () => void;
    /**
     * Whether the answer is good enough to accept. Returning `false` marks the group invalid and
     * calls nothing back — the calendar's old behaviour, available to every step.
     */
    canConfirm?: () => boolean;
    /** Overrides the shared *Confirm* label; a step rarely needs its own word for it. */
    label?: string;
    /** Overrides the hint; the accelerator supplies it otherwise. */
    hint?: string;
    /** A title attribute, for a step whose button needs a sentence the label cannot hold. */
    tooltip?: string;
    /** `enter` for a single-line answer, `mod-enter` where `Enter` belongs to a text area. */
    accelerator?: "enter" | "mod-enter";
    autoFocus?: boolean;
};

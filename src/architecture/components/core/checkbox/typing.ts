import { ReactNode } from "react";

export type CheckboxType = {
    onConfirm: (value: boolean) => void,
    confirmTooltip: string,
    /** What ticking the box means, in the words beside it (#684). */
    label: string,
    /** One quiet line under the label: what the answer writes. */
    hint?: string,
    confirmNode?: ReactNode;
    className?: string[],
};

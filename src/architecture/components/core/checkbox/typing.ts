import { ReactNode } from "react";

export type CheckboxType = {
    onConfirm: (value: boolean) => void,
    confirmTooltip: string,
    confirmNode?: ReactNode;
    className?: string[],
};
import { ReactNode } from "react";

export type DropdownType = {
    defaultValue?: string;
    options: [string, string][];
    confirmNode?: ReactNode;
    confirmTooltip?: string;
    className?: string[];
    onConfirm?: (value: string) => void;
    onKeyDown?: (key: string, currentValue: string) => void;
    autofocus?: boolean;
}
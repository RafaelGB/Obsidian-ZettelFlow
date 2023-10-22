export type DropdownType = {
    defaultValue?: string;
    options: Record<string, string>;
    className?: string[];
    onConfirm?: (value: string) => void;
    onKeyDown?: (key: string, currentValue: string) => void;
}
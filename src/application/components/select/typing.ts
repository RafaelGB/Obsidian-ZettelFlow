import { HexString } from "obsidian";

export type SelectType = {
    options: OptionType[];
    callback: (value: string) => void;
    className?: string[];
    autofocus?: boolean;
}

export type OptionElementType = {
    option: OptionType;
    isSelected: boolean;
    index: number;
    callback: (value: string) => void;
}

export type OptionType = {
    key: string;
    label: string;
    color: HexString;
    actionTypes: string[];
    tooltip?: string;
}
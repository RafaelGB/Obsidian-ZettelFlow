import { HexString } from "obsidian";

export type SelectType = {
    options: Option[];
    callback: (value: string) => void;
    className?: string[];
    autofocus?: boolean;
}

export type OptionElementType = {
    option: Option;
    isSelected: boolean;
    index: number;
    callback: (value: string) => void;
}

export type Option = {
    key: string;
    label: string;
    color: HexString;
    isLeaf: boolean;
    actionTypes: string[];
    tooltip?: string;
}
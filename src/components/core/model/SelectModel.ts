import { HexString } from "obsidian";
import { MouseEventHandler } from "react";

export type SelectType = {
    options: Option[];
    callback: (value: string) => void;
}

export type OptionElementType = {
    option: Option;
    isSelected: boolean;
    index: number;
    callback: MouseEventHandler<HTMLDivElement>
}

export type Option = {
    key: string;
    label: string;
    color: HexString;
}
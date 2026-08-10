import { HexString } from "obsidian";
import type { StepPhase } from "zettelkasten/phases";

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
    /** Optional knowledge-transformation phase (#149) used to group options in the selector. */
    phase?: StepPhase;
}
import { HexString } from "obsidian";
import type { StepPhase } from "zettelkasten/phases";

export type SelectType = {
    options: OptionType[];
    callback: (value: string) => void;
    className?: string[];
    autofocus?: boolean;
    /** Accessible name for the listbox (#407). Defaults to a generic options label. */
    label?: string;
}

export type OptionElementType = {
    option: OptionType;
    isSelected: boolean;
    /** The active (aria-activedescendant) option — keyboard position, not a choice (#407). */
    isActive: boolean;
    /** Stable DOM id so the listbox can point at this option (#407). */
    domId: string;
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
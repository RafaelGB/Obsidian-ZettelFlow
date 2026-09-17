import { Action } from "architecture/api";
import { Literal } from "architecture/plugin";

export type FinalElement = {
    result: Literal;
    /** The step this element came from (#445), so a failure can abandon the rest of that step. */
    stepId?: string;
} & Action;
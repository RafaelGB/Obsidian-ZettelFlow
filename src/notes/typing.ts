import { Action } from "architecture/api";
import { Literal } from "architecture/plugin";

export type FinalElement = {
    result: Literal;
} & Action;
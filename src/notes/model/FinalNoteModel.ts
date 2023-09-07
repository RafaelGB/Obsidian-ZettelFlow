import { Literal } from "architecture/plugin";
import { SectionElement } from "zettelkasten";

export type FinalElement = {
    result: Literal;
} & SectionElement;
import { Literal } from "architecture/plugin";
import { SectionElement } from "zettelkasten";

export type FinalNoteType = {
    targetFolder: string;
}
export type FinalElement = {
    result: Literal;
} & SectionElement;

export type FinalNoteInfo = {
    title: string;
    tags: string[];
    frontmatter: Record<string, Literal>;
    paths: Map<number, string>;
    elements: Map<number, FinalElement>;
    content: string;
} & FinalNoteType;
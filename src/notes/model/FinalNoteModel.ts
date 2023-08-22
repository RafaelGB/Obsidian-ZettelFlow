import { Literal } from "architecture/plugin";

export type FinalNoteType = {
    targetFolder: string;
}

export type FinalNoteInfo = {
    title: string;
    tags: string[];
    frontmatter: Record<string, Literal>;
} & FinalNoteType;
import { Literal } from "architecture/plugin";

export type FinalNoteType = {
    title: string;
    targetFolder: string;
}

export type FinalNoteInfo = {
    tags: string[];
    frontmatter: Record<string, Literal>;
} & FinalNoteType;
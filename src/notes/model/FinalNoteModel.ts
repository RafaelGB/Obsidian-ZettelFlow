import { ZettelFlowOptionMetadata } from "zettelcaster";

export type FinalNoteType = {
    title: string;
    targetFolder: string;
}

export type FinalNoteInfo = {
    tags: string[];
    frontmatter: Record<string, ZettelFlowOptionMetadata>;
} & FinalNoteType;
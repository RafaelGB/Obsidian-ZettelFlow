import { FinalElement, FinalNoteInfo, FinalNoteType } from "notes/model/FinalNoteModel";

export function finalNoteType2FinalNoteInfo(finalNoteType: FinalNoteType): FinalNoteInfo {
    return {
        ...finalNoteType,
        title: "",
        tags: [],
        frontmatter: {},
        paths: new Map<number, string>(),
        elements: new Map<number, FinalElement>(),
        content: "",
    };
}
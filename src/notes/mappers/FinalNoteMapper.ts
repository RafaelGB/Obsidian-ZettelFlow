import { FinalNoteInfo, FinalNoteType } from "notes/model/FinalNoteModel";

export function finalNoteType2FinalNoteInfo(finalNoteType: FinalNoteType): FinalNoteInfo {
    return {
        ...finalNoteType,
        title: "",
        tags: [],
        frontmatter: {},
        paths: [],
        elements: [],
        content: "",
    };
}
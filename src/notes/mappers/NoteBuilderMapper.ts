import { FinalNoteInfo, FinalNoteType } from "../model/FinalNoteModel";

export function finalNoteType2FinalNoteInfo(finalNote: FinalNoteType): FinalNoteInfo {
    return {
        ...finalNote,
    };
}
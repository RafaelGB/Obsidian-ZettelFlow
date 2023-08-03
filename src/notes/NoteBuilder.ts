import { FinalNoteInfo, FinalNoteType } from "./model/FinalNoteModel";
import { finalNoteType2FinalNoteInfo } from "./mappers/NoteBuilderMapper";
import { ObsidianApi, log } from "architecture";

export class Builder {
    public static init(finalNote: FinalNoteType): BuilderRoot {
        return new BuilderRoot(finalNote);
    }
}

class BuilderRoot {
    private info: FinalNoteInfo;
    constructor(finalNote: FinalNoteType) {
        this.info = finalNoteType2FinalNoteInfo(finalNote);
    }

    public build(): void {
        // TODO: create a note
        const content = "Hello World!";
        const path = this.info.targetFolder + "/" + this.info.title + ".md";
        ObsidianApi.vault().create(path, content).then((result) => {
            // TODO: open the note
            ObsidianApi.workspace().openLinkText(result.path, "");
            log.debug("Note created: " + result.path);
        });
    }
}
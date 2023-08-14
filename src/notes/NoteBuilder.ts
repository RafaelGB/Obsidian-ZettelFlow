import { FinalNoteInfo, FinalNoteType } from "./model/FinalNoteModel";
import { log } from "architecture";
import { finalNoteType2FinalNoteInfo } from "./mappers/FinalNoteMapper";
import { FrontMatterService, FileService } from "notes";
import { ZettelFlowOptionMetadata } from "zettelcaster";
import { TypeService } from "architecture/typing";
import { Notice } from "obsidian";

export class Builder {
    public static init(finalNote: FinalNoteType): BuilderRoot {
        const info = finalNoteType2FinalNoteInfo(finalNote);
        return new BuilderRoot(info);
    }
}

class BuilderRoot {
    constructor(private info: FinalNoteInfo) {
    }

    public addFrontMatter(frontmatter: Record<string, ZettelFlowOptionMetadata>) {
        if (frontmatter) {
            // Check if there are tags
            if (frontmatter.tags) {
                this.addTags(frontmatter.tags);
                delete frontmatter.tags;
            }
            // Merge the rest of the frontmatter
            this.info.frontmatter = { ...this.info.frontmatter, ...frontmatter };
        }
    }

    public build(): void {
        // TODO: check if the folder exists and create it if not

        // TODO: create a note
        const content = "Hola mundo";
        const path = this.info.targetFolder + "/" + this.info.title + ".md";
        FileService.createFile(path, content)
            .then((file) => {
                FrontMatterService.processFrontMatter(file, this.info).then(() => {
                    new Notice("Note created");
                }).catch((error) => {
                    log.error("Error while processing frontmatter: " + error);
                    new Notice("Error while processing frontmatter: " + error);
                });
            })
            .catch((error) => {
                log.error("Error while creating a file: " + error);
                new Notice("Error while creating a file: " + error);
            });
    }

    private addTags(tag: ZettelFlowOptionMetadata): BuilderRoot {
        if (!tag) return this;
        // Check if tag satisfies string
        if (TypeService.isString(tag)) {
            this.info.tags.push(tag);
            return this;
        }

        if (TypeService.isArray(tag, String)) {
            tag.forEach((t) => {
                this.info.tags.push(t);
            });
            return this;
        }
        return this;
    }
}
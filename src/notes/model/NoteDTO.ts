import { FinalElement } from "./FinalNoteModel";
import { log } from "architecture";
import { FileService } from "architecture/plugin";
import { SectionElement } from "zettelkasten";

export class NoteDTO {
    private title = "";
    private paths = new Map<number, string>();
    private elements = new Map<number, FinalElement>();
    private uniquePrefixPattern = "";
    private targetFolder = "";

    public getTitle(): string {
        return this.title;
    }

    public setTitle(title: string): NoteDTO {
        if (title) {
            this.title = title;
        }
        return this;
    }

    public getTargetFolder(): string {
        return this.targetFolder;
    }

    public setTargetFolder(targetFolder: string | undefined) {
        if (targetFolder) {
            this.targetFolder = targetFolder.endsWith(FileService.PATH_SEPARATOR)
                ? targetFolder.substring(0, targetFolder.length - 1)
                : targetFolder;
        }
        return this;
    }

    public getElements(): Map<number, FinalElement> {
        return this.elements;
    }

    public getElement(pos: number): FinalElement | undefined {
        return this.elements.get(pos);
    }

    public addElement(
        element: SectionElement,
        callbackResult: unknown,
        pos: number
    ): NoteDTO {
        this.elements.set(pos, {
            ...element,
            result: callbackResult,
        });
        return this;
    }

    public addFinalElement(element: FinalElement | undefined, pos: number) {
        if (element) {
            this.elements.set(pos, element);
        }
        return this;
    }
    public getPaths(): Map<number, string> {
        return this.paths;
    }

    public getPath(pos: number): string {
        const path = this.paths.get(pos);
        if (!path) {
            log.error(`No path found at position ${pos}`);
            throw new Error(`No path found at position ${pos}`);
        }
        return path;
    }

    public addPath(path: string, pos: number): NoteDTO {
        if (path && pos >= 0) {
            log.trace(`Builder: adding path ${path} at position ${pos}`);
            this.paths.set(pos, path);
        }
        return this;
    }

    public deletePos(pos: number): NoteDTO {
        this.paths.forEach((path, position) => {
            if (position >= pos) {
                this.paths.delete(position);
            }
        });
        this.elements.forEach((element, position) => {
            if (position >= pos) {
                this.elements.delete(position);
            }
        });
        return this;
    }

    public hasPattern(): boolean {
        return this.uniquePrefixPattern !== null && this.uniquePrefixPattern !== ""
    }

    public getPattern(): string {
        return this.uniquePrefixPattern;
    }

    public setPattern(pattern: string | undefined): NoteDTO {
        if (pattern) {
            this.uniquePrefixPattern = pattern;
        }
        return this;
    }
}
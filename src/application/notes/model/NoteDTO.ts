import { FinalElement } from "../typing";
import { log } from "architecture";
import { Action } from "architecture/api";
import { FileService } from "architecture/plugin";

export class NoteDTO {
    private title = "";
    private paths = new Map<number, string>();
    private savedActions = new Map<number, FinalElement>();
    private uniquePrefixPattern = "";
    private targetFolder = "";

    public getFinalPath(): string {
        return this.getTargetFolder()
            .concat(FileService.PATH_SEPARATOR)
            .concat(this.getTitle())
            .concat(FileService.MARKDOWN_EXTENSION);
    }

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
        return this.savedActions;
    }

    public getElement(pos: number): FinalElement | undefined {
        return this.savedActions.get(pos);
    }

    public addBackgroundAction(action: Action, pos: number): NoteDTO {
        this.savedActions.set(pos, {
            ...action,
            result: null,
        });
        return this;
    }

    public addAction(
        action: Action,
        callbackResult: unknown,
        pos: number
    ): NoteDTO {
        log.debug(`Builder: adding action ${action.label} at position ${pos}`);
        this.savedActions.set(pos, {
            ...action,
            result: callbackResult,
        });
        return this;
    }

    public addFinalElement(element: FinalElement | undefined, pos: number) {
        if (element) {
            this.savedActions.set(pos, element);
        }
        return this;
    }
    public getPaths(): Map<number, string> {
        return this.paths;
    }

    public getPath(pos: number): string | undefined {
        return this.paths.get(pos);
    }

    public addPath(path: string | undefined, pos: number): NoteDTO {
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
        this.savedActions.forEach((element, position) => {
            if (position >= pos) {
                this.savedActions.delete(position);
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
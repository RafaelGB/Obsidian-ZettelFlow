import { FinalElement } from "../typing";
import { log } from "architecture";
import { Action } from "architecture/api";
import { FileService } from "architecture/plugin";
import type { NotePersistence } from "./NotePersistence";
import { composeDestination } from "../destination";
import type { SatelliteDeclaration } from "../satellitePlan";

export class NoteDTO implements NotePersistence {
    private title = "";
    private paths = new Map<number, string>();
    /** Bodies contributed by steps that have no file of their own (#426). */
    private inlineBodies = new Map<number, string>();
    private savedActions = new Map<number, FinalElement>();
    private links: string[] = [];
    private uniquePrefixPattern = "";
    private targetFolder = "";
    private targetFolderLocked = false;
    private onCreationActions: Action[] = [];
    /**
     * The linked note a walked step declared (#419). One field, not a second note: the satellite is
     * a **byproduct** resolved at build time, so this DTO keeps modelling exactly one note.
     */
    private satellite: SatelliteDeclaration | undefined;

    public getFinalPath(): string {
        // Shared with the destination indicator (#408) so the two can never disagree.
        return composeDestination(this.getTargetFolder(), this.getTitle());
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
        if (this.targetFolderLocked) return this;
        if (targetFolder) {
            this.targetFolder = targetFolder.endsWith(FileService.PATH_SEPARATOR)
                ? targetFolder.substring(0, targetFolder.length - 1)
                : targetFolder;
        }
        return this;
    }

    /** Pin the note to this folder, ignoring any per-step targetFolder. */
    public lockTargetFolder(path: string): NoteDTO {
        if (path) {
            this.targetFolder = path.endsWith(FileService.PATH_SEPARATOR)
                ? path.substring(0, path.length - 1)
                : path;
            this.targetFolderLocked = true;
        }
        return this;
    }

    public isTargetFolderLocked(): boolean {
        return this.targetFolderLocked;
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
        log.debug(`Builder: adding action ${String(action.label)} at position ${pos}`);
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

    public getInlineBodies(): Map<number, string> {
        return this.inlineBodies;
    }

    public addInlineBody(body: string | undefined, pos: number): NoteDTO {
        if (body && body.trim().length > 0 && pos >= 0) this.inlineBodies.set(pos, body);
        return this;
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
        this.inlineBodies.forEach((body, position) => {
            if (position >= pos) {
                this.inlineBodies.delete(position);
            }
        });
        this.savedActions.forEach((element, position) => {
            if (position >= pos) {
                this.savedActions.delete(position);
            }
        });
        return this;
    }

    /**
     * Connection links chosen in the companion pane, appended to the note body as
     * `[[wikilinks]]` when the note is built (#127). Session-scoped: not tied to a step
     * position, so navigating back and forth does not discard them.
     */
    public getLinks(): string[] {
        return this.links;
    }

    public addLink(basename: string | undefined): NoteDTO {
        if (basename && !this.links.includes(basename)) {
            this.links.push(basename);
        }
        return this;
    }

    /**
     * The Knowledge Pattern on-creation actions (#170) collected from every walked step, in walk
     * order. Session-scoped (not tied to a step position) — the note-builder runs them as a block
     * once the note's structure is assembled.
     */
    public getOnCreation(): Action[] {
        return this.onCreationActions;
    }

    public addOnCreation(actions: Action[]): NoteDTO {
        if (actions.length > 0) this.onCreationActions.push(...actions);
        return this;
    }

    public getSatellite(): SatelliteDeclaration | undefined {
        return this.satellite;
    }

    /** The last declaring step wins; a step declaring nothing never clears an earlier declaration. */
    public setSatellite(declaration: SatelliteDeclaration | undefined): NoteDTO {
        if (declaration) this.satellite = declaration;
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
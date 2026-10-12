import { TFile, normalizePath, type App } from "obsidian";
import { log } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { saveExportToVault } from "architecture/components/core/export/saveExport";
import type { Thought, ThoughtLocator } from "application/thinking/thought";
import { exportFileName, freeExportPath } from "./readerDocument";
import { appendMarkdown, fleetingText, noteMarkdown } from "./readerSnapshot";

/**
 * **Keep a snapshot** (#763 FR-6) — the Reader's third named writer, beside the export and the recall.
 *
 * Only on a choice, and in **one recorded batch**: the image, saved where *Default location for new
 * attachments* puts it at a free path (`saveExportToVault`, through `FileService`), and what refers to
 * it — a new note (create-only), a fleeting note (the thought store), or the lines added at the end
 * of a note you chose. One Undo takes both back. The book is never written; nothing goes on the
 * clipboard.
 */

/** Where the capture goes, as the card's choice. */
export type SnapshotChoice =
    | { kind: "note"; caption: string; title: string }
    | { kind: "fleeting"; locator: ThoughtLocator }
    | { kind: "attach"; path: string };

/** The capture, and where it came from. */
export interface SnapshotToSave {
    blob: Blob;
    /** The image's name, before its extension: `Cap p. 4`. */
    name: string;
    /** The `source::` citation (#751). */
    citation: string;
    /** The source file. */
    source: string;
}

export interface SnapshotSaved {
    batch?: string;
    /** The image written. */
    image: string;
    /** The note created, for *Add note*. */
    path?: string;
    /** The thought kept, for *Fleeting note*. */
    thought?: Thought;
}

/** The thought store, as the writer uses it. */
export interface SnapshotStore {
    write(text: string, options: { about?: string; locator?: ThoughtLocator }): Promise<Thought | undefined>;
}

/** An embed of the image, in the vault's own link style, from where it is written. */
function embedOf(app: App, image: TFile, from: string): string {
    try {
        const link = app.fileManager?.generateMarkdownLink?.(image, from);
        if (link) return link.startsWith("!") ? link : `!${link}`;
    } catch {
        // A link Obsidian cannot make: the path, which always resolves.
    }
    return `![[${image.path}]]`;
}

/** The folder Obsidian puts a new note in, from the source you were reading. */
function newNoteFolder(app: App, source: string): string {
    try {
        const folder = app.fileManager?.getNewFileParent?.(source)?.path ?? "";
        return folder && folder !== "/" ? normalizePath(folder) : "";
    } catch {
        return "";
    }
}

export async function saveSnapshot(app: App, shot: SnapshotToSave, choice: SnapshotChoice, store: SnapshotStore = ThoughtStore.getInstance()): Promise<SnapshotSaved | null> {
    const saved: SnapshotSaved = { image: "" };
    try {
        await withWriteBatch({ kind: "manual", ref: "reader-snapshot", label: shot.name }, async () => {
            saved.batch = currentWriteBatch();
            const target = choice.kind === "attach" ? app.vault.getAbstractFileByPath(choice.path) : null;
            if (choice.kind === "attach" && !(target instanceof TFile)) throw new Error(`no note ${choice.path}`);
            const image = await saveExportToVault(shot.blob, shot.name);
            saved.image = image.path;
            if (choice.kind === "note") {
                const path = freeExportPath(newNoteFolder(app, shot.source), exportFileName(choice.title), (p) => app.vault.getAbstractFileByPath(p) !== null);
                await FileService.createFile(path, noteMarkdown({ embed: embedOf(app, image, path), caption: choice.caption, citation: shot.citation }), false);
                saved.path = path;
            } else if (choice.kind === "fleeting") {
                const thought = await store.write(fleetingText({ embed: embedOf(app, image, "") }), { about: shot.source, locator: choice.locator });
                if (!thought) throw new Error("the thought store kept nothing");
                saved.thought = thought;
            } else if (target instanceof TFile) {
                await FileService.appendTo(target, appendMarkdown({ embed: embedOf(app, image, target.path), citation: shot.citation }));
            }
        });
        return saved;
    } catch (error) {
        log.error(`[Reader] could not keep a snapshot of ${shot.source}: ${error instanceof Error ? error.message : String(error)}`);
        // Whatever of the batch was written goes back with it: a snapshot is kept whole or not at all.
        if (saved.batch && saved.image) await undoBatch(saved.batch).catch(() => undefined);
        return null;
    }
}

/** Take a snapshot back: its batch, undone — the image and what referred to it. Whether it went. */
export async function undoSnapshot(batch: string): Promise<boolean> {
    const outcome = await undoBatch(batch);
    return outcome.hadWork && outcome.failed.length === 0;
}

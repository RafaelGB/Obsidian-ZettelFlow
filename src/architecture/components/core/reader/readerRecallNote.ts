import { normalizePath, type App } from "obsidian";
import { log } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { crystallizeFlowPath, crystallizeThroughFlow } from "architecture/plugin/thinking/crystallizeThroughFlow";
import { recallPlan, renderRecallNote } from "application/library/recallNote";
import { exportFileName, freeExportPath } from "./readerDocument";

/**
 * **Keep a recall as a note** (#760 FR-6) — the Reader's second named writer, beside the export.
 *
 * Only on *Create note*, and create-only: a free path is found next to anything that exists, never
 * over it, in the folder Obsidian puts new notes in. The write is recorded in a batch of its own, so
 * the card can offer *Undo* (the new note goes to the trash). With a canvas holding *Crystallizes
 * thoughts* the words continue in that flow instead (#712), which builds the note itself.
 */

export interface RecallNotePlan {
    /** The note's title, as you accepted it in the preview. */
    title: string;
    /** Your words, as you typed them. */
    words: string;
    /** The `source::` line's citation. */
    citation: string;
    /** The source recalled from: where Obsidian's *Default location for new notes* is decided from. */
    sourcePath: string;
}

export interface RecallNoteResult {
    ok: boolean;
    /** The note written; `undefined` while a flow builds it. */
    path?: string;
    batch?: string;
    /** The words went on into the crystallize flow. */
    flow?: boolean;
}

/** The folder Obsidian puts a new note in, from the source you were reading. */
function newNoteFolder(app: App, sourcePath: string): string {
    try {
        const folder = app.fileManager?.getNewFileParent?.(sourcePath)?.path ?? "";
        return folder && folder !== "/" ? normalizePath(folder) : "";
    } catch {
        return "";
    }
}

/** The crystallize flow a recall continues in, by its canvas name; `""` when none. */
export function recallFlowName(): string {
    const path = crystallizeFlowPath();
    return path ? (path.split("/").pop() ?? path).replace(/\.canvas$/i, "") : "";
}

export async function keepRecall(app: App, plan: RecallNotePlan, onBuilt?: (path: string) => void): Promise<RecallNoteResult> {
    const flowPath = crystallizeFlowPath();
    if (flowPath) {
        const opened = await crystallizeThroughFlow({
            plan: recallPlan(plan.title, plan.words, plan.citation),
            title: plan.title,
            body: plan.words,
            flowPath,
            onDone: (path) => onBuilt?.(path),
        });
        return opened === "opened" ? { ok: true, flow: true } : { ok: false };
    }
    const folder = newNoteFolder(app, plan.sourcePath);
    const path = freeExportPath(folder, exportFileName(plan.title), (p) => app.vault.getAbstractFileByPath(p) !== null);
    try {
        let batch: string | undefined;
        await withWriteBatch({ kind: "manual", ref: "reader-recall", label: path }, async () => {
            batch = currentWriteBatch();
            await FileService.createFile(path, renderRecallNote(plan.words, plan.citation), false);
        });
        return { ok: true, path, batch };
    } catch (error) {
        log.error(`[Reader] could not keep the recall as ${path}: ${error instanceof Error ? error.message : String(error)}`);
        return { ok: false };
    }
}

/** Take a kept recall back: its batch, undone. Whether it went. */
export async function undoRecall(batch: string): Promise<boolean> {
    const outcome = await undoBatch(batch);
    return outcome.hadWork && outcome.failed.length === 0;
}

import type { TFile } from "obsidian";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { readBookNote, type BookChange, type BookDetails, type DeclaredMetadata } from "application/library/bookNote";
import type { ShelfItem } from "application/library/shelf";
import type { ShelfEdit } from "application/library/shelves";
import { realDetailsPort, type DetailsPort } from "./libraryDetails";

/**
 * **Your shelves, written** (#821) — every change to where books stand is **one recorded batch**,
 * taken back by one Undo: a book put on a shelf, or a shelf renamed or deleted across every note on
 * it. Only through the book note's own writer (`bookNoteWriter.ts`), so `FrontmatterService` and
 * `FileService` take the write record; the book file is never touched. A book with no note yet gets
 * one, in the *Book notes folder*, the way Details makes one.
 */

/** The writes a shelf change makes, injectable so a test can watch them without a vault. */
export type ShelfWritePort = Pick<DetailsPort, "create" | "edit" | "editArticle" | "undo" | "noteAt">;

export const realShelfWritePort: ShelfWritePort = realDetailsPort;

export type ShelfStep = { kind: "move"; item: ShelfItem; change: BookChange } | { kind: "edit"; edit: ShelfEdit };

export interface ShelfWriteContext {
    /** The Book notes folder, as the setting holds it now. */
    folder: () => string;
    /** What a book's file declares, read only if its note is created now. */
    declared: (item: ShelfItem) => () => Promise<DeclaredMetadata>;
}

/** What a step left a book's note saying, and where it is — for the shelf to show at once. */
export interface ShelfWritten {
    id: string;
    details: BookDetails;
    note: string;
}

/** Apply a change to what a note holds: a value sets a field, `null` takes it away. */
function applied(base: BookDetails, change: BookChange): BookDetails {
    const next: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(change)) {
        if (value === null || value === undefined) delete next[key];
        else next[key] = value;
    }
    return next;
}

/** Run the steps in one batch. Returns the batch, and what each moved book's note now says. Throws on a failure. */
export async function applyShelfWrites(
    steps: readonly ShelfStep[],
    port: ShelfWritePort,
    context: ShelfWriteContext,
    label: string
): Promise<{ batch: string | undefined; written: ShelfWritten[] }> {
    const written: ShelfWritten[] = [];
    let batch: string | undefined;
    const editNote = (file: TFile, change: BookChange, article: boolean) =>
        article && port.editArticle ? port.editArticle(file, change) : port.edit(file, change);
    await withWriteBatch({ kind: "manual", ref: "book-shelf", label }, async () => {
        batch = currentWriteBatch();
        for (const step of steps) {
            if (step.kind === "edit") {
                const file = port.noteAt(step.edit.path);
                if (file) await editNote(file, { collections: step.edit.collections }, step.edit.article);
                continue;
            }
            const { item, change } = step;
            const existing = item.note ? port.noteAt(item.note) : null;
            if (existing) {
                await editNote(existing, change, item.kind === "article");
                written.push({ id: item.id, details: applied(item.details ?? {}, change), note: existing.path });
            } else if (item.file && item.kind !== "article") {
                const write = await port.create({ source: item.file, folder: context.folder(), title: item.title, change, declared: context.declared(item) });
                written.push({ id: item.id, details: readBookNote(write.fields ?? {}), note: write.file.path });
            }
        }
    });
    return { batch, written };
}

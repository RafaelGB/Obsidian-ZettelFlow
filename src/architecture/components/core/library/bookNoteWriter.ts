import { TFile } from "obsidian";
import { ObsidianApi } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import {
    BOOK_LINK_KEY,
    bookLink,
    bookNoteFields,
    bookNoteMarkdown,
    freeBookNotePath,
    type BookChange,
    type DeclaredMetadata,
} from "application/library/bookNote";

/**
 * **The one writer of a book's note** (#743, epic #742).
 *
 * Three writes, each one recorded batch you can take back, and nothing else:
 *
 * - **create** — the first time you change something about a book: a new note at a free path in the
 *   *Book notes folder*, linking the book, filled with what the file declares and your change. The
 *   folder is made now, if it is missing — never when the setting is saved.
 * - **edit** — every change after that: only the keys you changed, through `FrontmatterService`.
 * - **adopt** — *Use a note you already have*: only the link to the book is added.
 *
 * And one for an article (#744): its status and collections, in its own frontmatter — `editArticle`.
 *
 * The book file itself is never written. This lives in the Library, outside the Reader, which still
 * writes no note (`readerShell.test.ts`).
 */

/** What a write did: the note, and the batch to take it back by. */
export interface BookNoteWrite {
    file: TFile;
    batch?: string;
    /** For a creation: everything the note was made with. */
    fields?: Record<string, unknown>;
}

const ORIGIN = (label: string) => ({ kind: "manual" as const, ref: "book-note", label });

export interface CreateBookNote {
    /** The book's path in the vault. */
    source: string;
    /** The Book notes folder, as the setting holds it now. */
    folder: string;
    /** What to name the note after: the book's title. */
    title: string;
    change: BookChange;
    /** What the file declares — read only now, at creation (FR-5). */
    declared: () => Promise<DeclaredMetadata>;
}

/** The first change about a book: its note, created. Never over an existing file. */
export async function createBookNote(request: CreateBookNote): Promise<BookNoteWrite> {
    let declared: DeclaredMetadata = {};
    try {
        declared = await request.declared();
    } catch {
        declared = {};
    }
    const title = (typeof request.change.title === "string" && request.change.title) || request.title;
    const vault = ObsidianApi.vault();
    const path = freeBookNotePath(request.folder, title, (candidate) => vault.getAbstractFileByPath(candidate) !== null);
    const fields = bookNoteFields(request.source, declared, request.change);
    const content = bookNoteMarkdown(fields);
    let batch: string | undefined;
    const file = await withWriteBatch(ORIGIN(path), async () => {
        batch = currentWriteBatch();
        return FileService.createFile(path, content, false);
    });
    return { file, batch, fields };
}

/** A change to a note that already exists: only those keys, recorded with what they were. */
export async function editBookNote(file: TFile, change: BookChange): Promise<BookNoteWrite> {
    let batch: string | undefined;
    await withWriteBatch(ORIGIN(file.path), async () => {
        batch = currentWriteBatch();
        await FrontmatterService.instance(file).update((frontmatter) => {
            for (const [key, value] of Object.entries(change)) {
                if (value === null || value === undefined) delete frontmatter[key];
                else frontmatter[key] = Array.isArray(value) ? [...value] : value;
            }
        });
    });
    return { file, batch };
}

/** What may be written into an article's own frontmatter (#744 FR-4): where it stands for you, and its collections. */
export const ARTICLE_KEYS = ["status", "collections"] as const;

/**
 * A change to an article (#744 FR-4, AC-5): a clipping is its own note, so its status and its
 * collections are written into its frontmatter — through `FrontmatterService`, one recorded batch —
 * and nothing else in it is touched. A change to any other key is dropped, never written.
 */
export async function editArticle(file: TFile, change: BookChange): Promise<BookNoteWrite> {
    const kept: BookChange = {};
    for (const key of ARTICLE_KEYS) if (key in change) (kept as Record<string, unknown>)[key] = change[key];
    if (Object.keys(kept).length === 0) return { file };
    return editBookNote(file, kept);
}

/** *Use a note you already have* (FR-7): the link to the book is added, and nothing else. */
export async function adoptNote(file: TFile, source: string): Promise<BookNoteWrite> {
    let batch: string | undefined;
    await withWriteBatch(ORIGIN(file.path), async () => {
        batch = currentWriteBatch();
        await FrontmatterService.instance(file).update((frontmatter) => {
            frontmatter[BOOK_LINK_KEY] = bookLink(source);
        });
    });
    return { file, batch };
}

/** The note at a path, when it is one. */
export function noteAt(path: string): TFile | null {
    const file = ObsidianApi.vault().getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
}

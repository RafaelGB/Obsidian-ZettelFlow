import type { TFile } from "obsidian";
import { log } from "architecture";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { pageWordsOf } from "application/library/pdfWords";
import type { Thought } from "application/thinking/thought";
import { classifyMarks, highlightPayload, markedPages, notePayload, placeHighlights, placeNotes, userSpaceGeometry, type PageBox } from "application/reader/share/shareMarks";
import { checkCopy, fillHoles, freeCopyPath, holeFor, type CopyCheck, type Hole, type PlannedMark, type ReadMark } from "application/reader/share/shareFill";
import { isTextItem, type PdfDocument, type PdfPage } from "architecture/components/core/library/sources/pdfjs";

/**
 * **Make the shared copy** (#842, epic #836): the one run that reads the PDF, asks Obsidian's own
 * pdf.js to write a copy with your marks on it, checks the copy reads back as written, and only then
 * creates it — beside the original, which is only ever read.
 *
 * Nothing here runs until it is asked (FR-17): no import loads pdf.js, and the run opens its **own**
 * document from bytes it read once, so the Reader's page, its place and its view are never touched
 * (FR-16). Only the pages with a mark are read (FR-18), one at a time, a frame between each.
 */

/** What the run needs from the app: injected, so it is tested without Obsidian or a real pdf.js. */
export interface ShareDeps {
    open(data: Uint8Array): Promise<PdfDocument>;
    readBinary(path: string): Promise<ArrayBuffer>;
    exists(path: string): boolean;
    /** Create-only (FR-14): `null` when something is already at `path`, which is never written. */
    create(path: string, data: ArrayBuffer): Promise<TFile | null>;
    /** Let a frame through between two pages. */
    frame(): Promise<void>;
}

export interface ShareInput {
    path: string;
    thoughts: readonly Thought[];
    author: string;
    /** The copy's suffix in the language spoken: `annotated`, `anotado`. */
    suffix: string;
}

/** What the run is doing, for the one line the sheet shows while it works (FR-15). */
export type ShareStep = { step: "place"; page: number; of: number } | { step: "write" } | { step: "check" };

export type ShareOutcome =
    | { ok: true; path: string; batch?: string; unplaced: number }
    | { ok: false; reason: "empty" | "protected" | "unplaced" | "check" | "failed" | "cancelled"; check?: CopyCheck };

/** A protected PDF (FR-13): asked for a password, or carrying an encryption dictionary. */
async function isProtected(doc: PdfDocument): Promise<boolean> {
    const info: Record<string, unknown> = (await doc.getMetadata().catch(() => ({ info: {} }))).info ?? {};
    if (info.EncryptFilterName !== undefined && info.EncryptFilterName !== null) return true;
    return (await doc.getPermissions?.().catch(() => null)) != null;
}

function boxOf(page: PdfPage): PageBox {
    const view = page.view;
    if (view && view.length === 4) return [view[0], view[1], view[2], view[3]];
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    return [0, 0, viewport.width, viewport.height];
}

/** The annotations of a page as the copy is checked against them. */
async function readMarks(page: PdfPage): Promise<ReadMark[]> {
    const annotations = (await page.getAnnotations?.({ intent: "display" })) ?? [];
    return annotations.map((a) => ({ subtype: a.subtype, contents: a.contentsObj?.str ?? "", title: a.titleObj?.str ?? "" }));
}

/** The comment a highlight carries: its margin note, as you wrote it. */
const commentOf = (thought: Thought) => thought.text.trim();

export async function shareCopy(deps: ShareDeps, input: ShareInput, signal: { aborted: boolean }, onStep: (step: ShareStep) => void = () => undefined): Promise<ShareOutcome> {
    const marks = classifyMarks(input.thoughts);
    if (marks.highlights.length === 0 && marks.notes.length === 0) return { ok: false, reason: "empty" };
    let doc: PdfDocument | null = null;
    let check: PdfDocument | null = null;
    try {
        const original = new Uint8Array(await deps.readBinary(input.path));
        try {
            // pdf.js may take the buffer it is given: it gets a copy, the original stays to compare with.
            doc = await deps.open(original.slice());
        } catch (error) {
            if ((error as { name?: string } | null)?.name === "PasswordException") return { ok: false, reason: "protected" };
            throw error;
        }
        if (await isProtected(doc)) return { ok: false, reason: "protected" };
        if (!doc.annotationStorage || !doc.saveDocument) return { ok: false, reason: "failed" };

        const pages = markedPages(marks).filter((index) => index >= 0 && index < doc!.numPages);
        const planned: PlannedMark[] = [];
        const holes: Hole[] = [];
        const before = new Map<number, number>();
        let unplaced = marks.highlights.filter((thought) => !pages.includes(thought.locator!.at)).length;
        let key = 0;
        for (const [i, index] of pages.entries()) {
            if (signal.aborted) return { ok: false, reason: "cancelled" };
            onStep({ step: "place", page: i + 1, of: pages.length });
            const page = await doc.getPage(index + 1);
            const content = await page.getTextContent();
            const view = boxOf(page);
            // The very text the reading view drew this page as (FR-1): its highlights anchor there.
            const text = pageWordsOf(content.items.filter(isTextItem), userSpaceGeometry(view), { styles: content.styles ?? {} });
            before.set(index, (await readMarks(page)).length);
            const { placed, unplaced: lost } = placeHighlights(text, view, marks.highlights.filter((each) => each.locator!.at === index));
            unplaced += lost.length;
            for (const { thought, lines } of placed) {
                const hole = holeFor(key, commentOf(thought), input.author);
                if (hole) holes.push(hole);
                doc.annotationStorage.setValue(`pdfjs_internal_editor_${key++}`, highlightPayload(lines, index, thought, hole?.user));
                planned.push({ page: index, subtype: "Highlight", contents: commentOf(thought), author: input.author });
            }
            const notes = marks.notes.filter((each) => each.locator!.at === index);
            placeNotes(view, text.words, notes.map(commentOf)).forEach((note) => {
                doc!.annotationStorage!.setValue(`pdfjs_internal_editor_${key++}`, notePayload(note, index, input.author || undefined));
                planned.push({ page: index, subtype: "FreeText", contents: note.lines.join("\n"), author: input.author });
            });
            await deps.frame();
        }
        if (planned.length === 0) return { ok: false, reason: "unplaced" };

        if (signal.aborted) return { ok: false, reason: "cancelled" };
        onStep({ step: "write" });
        const saved = await doc.saveDocument();
        const missing = fillHoles(saved, holes, original.length);

        if (signal.aborted) return { ok: false, reason: "cancelled" };
        onStep({ step: "check" });
        check = await deps.open(saved.slice());
        const after = new Map<number, ReadMark[]>();
        for (const index of new Set(planned.map((mark) => mark.page))) after.set(index, await readMarks(await check.getPage(index + 1)));
        const failed = checkCopy({ saved, original, missing, planned, before, after });
        if (failed) {
            log.warn(`[Reader] the shared copy of ${input.path} did not read back as written (${failed}): nothing was saved`);
            return { ok: false, reason: "check", check: failed };
        }

        if (signal.aborted) return { ok: false, reason: "cancelled" };
        const cut = input.path.lastIndexOf("/");
        const folder = cut >= 0 ? input.path.slice(0, cut) : "";
        const stem = (cut >= 0 ? input.path.slice(cut + 1) : input.path).replace(/\.pdf$/i, "");
        const data = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
        let batch: string | undefined;
        let written: string | null = null;
        await withWriteBatch({ kind: "manual", ref: "reader-share", label: input.path }, async () => {
            batch = currentWriteBatch();
            // A file that appears between the free name and the create moves the copy on, never over it.
            const taken = new Set<string>();
            for (let tries = 0; tries < 3 && !written; tries++) {
                const path = freeCopyPath(folder, stem, input.suffix, (p) => taken.has(p) || deps.exists(p));
                if (await deps.create(path, data)) written = path;
                else taken.add(path);
            }
        });
        if (!written) return { ok: false, reason: "failed" };
        return { ok: true, path: written, ...(batch ? { batch } : {}), unplaced };
    } catch (error) {
        log.error(`[Reader] could not share a copy of ${input.path}: ${error instanceof Error ? error.message : String(error)}`);
        return { ok: false, reason: "failed" };
    } finally {
        void doc?.destroy().catch(() => undefined);
        void check?.destroy().catch(() => undefined);
    }
}

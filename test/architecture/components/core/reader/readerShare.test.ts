/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TFile } from "obsidian";
import { __setMockObsidianApi } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { bufferedWrites, replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { shareCopy, type ShareDeps } from "architecture/components/core/reader/readerShareRun";
import { hasMarks, shareCounts } from "architecture/components/core/reader/readerShare";
import { utf16Hex } from "application/reader/share/shareFill";
import type { Thought } from "application/thinking/thought";

/**
 * **Make the shared copy** (#842): the run over a fake pdf.js and a vault in memory — what it reads,
 * what it refuses, and the one create it makes, beside the original and never over anything.
 */

const PATH = "Papers/cap.pdf";
const ORIGINAL = Uint8Array.from("%PDF-1.4 the original bytes %%EOF", (ch) => ch.charCodeAt(0));
const LINE = "Brewer conjectured that a web service cannot be consistent and available at once.";

let current: { files: Map<string, Uint8Array> } = { files: new Map() };

function vaultOf() {
    const files = new Map<string, Uint8Array>([[PATH, ORIGINAL]]);
    const trashed: string[] = [];
    const tfile = (path: string) => Object.assign(new TFile(), { path, name: path.split("/").pop(), extension: "pdf", stat: { mtime: 1, ctime: 1, size: files.get(path)?.length ?? 0 } });
    const vault = {
        getAbstractFileByPath: (path: string) => (files.has(path) ? tfile(path) : null),
        getFileByPath: (path: string) => (files.has(path) ? tfile(path) : null),
        createBinary: jest.fn(async (path: string, data: ArrayBuffer) => {
            if (files.has(path)) throw new Error("File already exists.");
            files.set(path, new Uint8Array(data));
            return tfile(path);
        }),
        modifyBinary: jest.fn(),
    };
    const fileManager = { trashFile: jest.fn(async (file: TFile) => void (trashed.push(file.path), files.delete(file.path))) };
    __setMockObsidianApi({ vault, fileManager, metadataCache: { getFileCache: () => null } } as never);
    current = { files };
    return { files, trashed, vault, fileManager };
}

/** A fake pdf.js document: `pages` of one line each, its saving as pdf.js does, and a copy to read back. */
function fakePdf(options: { pages?: number; protectedBy?: "password" | "encrypt"; corrupt?: boolean } = {}) {
    const calls = { textContent: [] as number[], saved: 0, opened: 0 };
    const stored: Record<string, any>[] = [];
    const original = { annotations: [{ subtype: "Link" }] };
    const page = (n: number, read: (index: number) => any[]) => ({
        view: [0, 0, 612, 792],
        getViewport: () => ({ width: 612, height: 792 }),
        getTextContent: async () => {
            calls.textContent.push(n);
            return { items: [{ str: LINE, transform: [10, 0, 0, 10, 72, 700], width: LINE.length * 5, height: 10, fontName: "F1" }], styles: { F1: { fontFamily: "serif" } } };
        },
        getAnnotations: async () => read(n - 1),
    });
    const doc = (copy: Uint8Array | null) => ({
        numPages: options.pages ?? 3,
        getPage: async (n: number) =>
            page(n, (index) => {
                if (!copy) return original.annotations;
                // Read back from the bytes as pdf.js would: each new mark, its comment from its filled hole.
                const text = Buffer.from(copy).toString("latin1");
                const mine = stored.filter((p) => p.pageIndex === index).map((p) => {
                    if (p.annotationType === 3) return { subtype: "FreeText", contentsObj: { str: p.value }, titleObj: { str: p.user ?? "" } };
                    const hole = p.user ? text.indexOf(`/Contents <FEFF`, text.indexOf(`#${stored.indexOf(p)}#`)) : -1;
                    const hex = hole >= 0 ? text.slice(hole + 15, text.indexOf(">", hole)) : "";
                    const str = (hex.match(/.{4}/g) ?? []).map((unit) => String.fromCharCode(parseInt(unit, 16))).join("");
                    return { subtype: "Highlight", contentsObj: { str: options.corrupt ? `${str}!` : str }, titleObj: { str: text.includes(utf16Hex("Rafa")) ? "Rafa" : "" } };
                });
                return [...original.annotations, ...mine];
            }),
        getMetadata: async () => ({ info: options.protectedBy === "encrypt" ? { EncryptFilterName: "Standard" } : {} }),
        getPermissions: async () => null,
        annotationStorage: { setValue: (_key: string, value: Record<string, any>) => void stored.push(value) },
        // pdf.js's incremental update: the original, then each new mark with its author written as `/T (…)`.
        saveDocument: async () => {
            calls.saved++;
            const tail = stored.map((p, i) => `#${i}# /Subtype ${p.annotationType}${p.user ? ` /T (${p.user})` : ""} endobj`).join("\n");
            return Uint8Array.from(`${Buffer.from(ORIGINAL).toString("latin1")}\n${tail}`, (ch) => ch.charCodeAt(0));
        },
        destroy: async () => undefined,
    });
    const open = jest.fn(async (data: Uint8Array) => {
        calls.opened++;
        if (options.protectedBy === "password") throw Object.assign(new Error("No password given"), { name: "PasswordException" });
        return doc(calls.opened === 1 ? null : data) as never;
    });
    return { open, calls, stored };
}

function deps(pdf: ReturnType<typeof fakePdf>): ShareDeps {
    return {
        open: pdf.open,
        readBinary: async () => ORIGINAL.buffer.slice(0) as ArrayBuffer,
        exists: (path) => current.files.has(path),
        create: (path, data) => FileService.createBinaryFileOnce(path, data),
        frame: async () => undefined,
    };
}

const highlight = (at: number, text = ""): Thought =>
    ({ id: `h${at}`, at: 1, text, links: [], about: PATH, quote: { exact: "a web service cannot be consistent", prefix: "conjectured that ", suffix: " and available" }, locator: { at, label: `p. ${at + 1}` } }) as unknown as Thought;

beforeEach(() => replaceBufferedWrites([]));

describe("a create that never writes over anything (#842 FR-14, AC-20)", () => {
    it("creates a free path once, and records it, so Undo can take it back", async () => {
        const { files } = vaultOf();
        expect(await FileService.createBinaryFileOnce("Papers/new.pdf", new ArrayBuffer(3))).not.toBeNull();
        expect(files.get("Papers/new.pdf")?.length).toBe(3);
        expect(bufferedWrites().map((write) => [write.kind, write.path])).toEqual([["file-created", "Papers/new.pdf"]]);
    });

    it("leaves an existing file exactly as it was, writing nothing and recording nothing", async () => {
        const { files, vault } = vaultOf();
        expect(await FileService.createBinaryFileOnce(PATH, new ArrayBuffer(9))).toBeNull();
        expect(vault.createBinary).not.toHaveBeenCalled();
        expect(vault.modifyBinary).not.toHaveBeenCalled();
        expect(files.get(PATH)).toBe(ORIGINAL);
        expect(bufferedWrites()).toEqual([]);
    });
});

describe("making the shared copy (#842)", () => {
    it("writes one new PDF beside the original, which is only read, and Undo sends it to the trash (AC-8, AC-11)", async () => {
        const { files, trashed } = vaultOf();
        const pdf = fakePdf();
        const outcome = await shareCopy(deps(pdf), { path: PATH, thoughts: [highlight(1, "Revisa esto: ¿por qué?")], author: "Rafa", suffix: "annotated" }, { aborted: false });
        expect(outcome).toMatchObject({ ok: true, path: "Papers/cap (annotated).pdf", unplaced: 0 });
        expect(files.get(PATH)).toBe(ORIGINAL);
        const copy = Buffer.from(files.get("Papers/cap (annotated).pdf")!).toString("latin1");
        expect(copy.startsWith(Buffer.from(ORIGINAL).toString("latin1"))).toBe(true);
        expect(copy).toContain(`/Contents ${utf16Hex("Revisa esto: ¿por qué?")}`);
        // One batch, under the share's own name; Undo takes it back to the trash.
        const writes = bufferedWrites();
        expect(writes.map((write) => [write.kind, write.origin.kind === "manual" ? write.origin.ref : ""])).toEqual([["file-created", "reader-share"]]);
        const undone = await undoBatch((outcome as { batch: string }).batch);
        expect(undone.failed).toEqual([]);
        expect(trashed).toEqual(["Papers/cap (annotated).pdf"]);
    });

    it("never writes over a copy already there: the next free name (AC-8)", async () => {
        const { files } = vaultOf();
        files.set("Papers/cap (annotated).pdf", Uint8Array.from([7]));
        const outcome = await shareCopy(deps(fakePdf()), { path: PATH, thoughts: [highlight(0)], author: "", suffix: "anotado" }, { aborted: false });
        expect(outcome).toMatchObject({ ok: true, path: "Papers/cap (anotado).pdf" });
        const again = await shareCopy(deps(fakePdf()), { path: PATH, thoughts: [highlight(0)], author: "", suffix: "annotated" }, { aborted: false });
        expect(again).toMatchObject({ ok: true, path: "Papers/cap (annotated) 2.pdf" });
        expect(files.get("Papers/cap (annotated).pdf")).toEqual(Uint8Array.from([7]));
    });

    it("reads only the pages with a mark: 3 of 400 (FR-18, AC-13)", async () => {
        vaultOf();
        const pdf = fakePdf({ pages: 400 });
        const steps: string[] = [];
        await shareCopy(deps(pdf), { path: PATH, thoughts: [highlight(3), highlight(120), highlight(399)], author: "", suffix: "annotated" }, { aborted: false }, (step) => steps.push(step.step === "place" ? `place ${step.page}/${step.of}` : step.step));
        expect(pdf.calls.textContent).toEqual([4, 121, 400]);
        expect(steps).toEqual(["place 1/3", "place 2/3", "place 3/3", "write", "check"]);
    });

    it("refuses a protected PDF before reading a page of it, and writes nothing (FR-13, AC-10)", async () => {
        for (const protectedBy of ["password", "encrypt"] as const) {
            const { files } = vaultOf();
            const pdf = fakePdf({ protectedBy });
            expect(await shareCopy(deps(pdf), { path: PATH, thoughts: [highlight(0)], author: "", suffix: "annotated" }, { aborted: false })).toEqual({ ok: false, reason: "protected" });
            expect(pdf.calls.textContent).toEqual([]);
            expect(pdf.calls.saved).toBe(0);
            expect(files.size).toBe(1);
        }
    });

    it("saves nothing when the copy does not read back as written (FR-11, AC-9)", async () => {
        const { files } = vaultOf();
        const outcome = await shareCopy(deps(fakePdf({ corrupt: true })), { path: PATH, thoughts: [highlight(0, "A note")], author: "", suffix: "annotated" }, { aborted: false });
        expect(outcome).toEqual({ ok: false, reason: "check", check: "contents" });
        expect(files.size).toBe(1);
        expect(bufferedWrites()).toEqual([]);
    });

    it("writes nothing once cancelled, even after the copy was written in memory (FR-16, AC-14)", async () => {
        const { files } = vaultOf();
        const signal = { aborted: false };
        const outcome = await shareCopy(deps(fakePdf()), { path: PATH, thoughts: [highlight(0)], author: "", suffix: "annotated" }, signal, (step) => {
            if (step.step === "check") signal.aborted = true;
        });
        expect(outcome).toEqual({ ok: false, reason: "cancelled" });
        expect(files.size).toBe(1);
    });

    it("counts a highlight it cannot place, and leaves it off the copy (FR-7, AC-7)", async () => {
        vaultOf();
        const lost = { ...highlight(0), id: "lost", quote: { exact: "words that are not on the page", prefix: "", suffix: "" } } as Thought;
        const outcome = await shareCopy(deps(fakePdf()), { path: PATH, thoughts: [highlight(0), lost], author: "", suffix: "annotated" }, { aborted: false });
        expect(outcome).toMatchObject({ ok: true, unplaced: 1 });
    });

    it("has nothing to share for a PDF with no marks, and says what goes on the copy otherwise (FR-21, FR-22)", () => {
        expect(hasMarks([])).toBe(false);
        expect(hasMarks([highlight(0)])).toBe(true);
        const note = { id: "n", at: 1, text: "On the figure.", links: [], about: PATH, locator: { at: 2, label: "p. 3" } } as unknown as Thought;
        expect(shareCounts([highlight(0, "A note"), highlight(1), note])).toBe("2 highlights · 1 with a note · 1 margin note");
        expect(shareCounts([highlight(0)])).toBe("1 highlight");
    });
});

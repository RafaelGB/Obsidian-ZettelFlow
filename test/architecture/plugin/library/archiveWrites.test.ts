import { describe, it, expect } from "@jest/globals";
import { TFile } from "obsidian";
import { archiveItem, forgetArchive, moveArchive, returnItem, type ArchiveHost, type ArchivePort } from "architecture/plugin/library/archiveWrites";
import { currentWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import type { ShelfItem } from "application/library/shelf";

/** A vault of paths, and every write it was asked for — each with the batch it ran in. */
function fakeVault(files: string[], folders: string[] = [], options: { stale?: boolean; failMove?: boolean } = {}) {
    const paths = new Set(files);
    const dirs = new Set(folders);
    const log: { op: string; args: string[]; batch: string | undefined }[] = [];
    const port: ArchivePort = {
        file: (path) => (paths.has(path) ? Object.assign(new TFile(), { path }) : null),
        folderExists: (path) => dirs.has(path),
        exists: (path) => paths.has(path),
        createFolder: async (path) => {
            dirs.add(path);
            log.push({ op: "folder", args: [path], batch: currentWriteBatch() });
        },
        move: async (file, to) => {
            if (options.failMove) throw new Error("disk full");
            paths.delete(file.path);
            paths.add(to);
            log.push({ op: "move", args: [file.path, to], batch: currentWriteBatch() });
        },
        relink: async (note, to) => {
            if (options.stale) log.push({ op: "relink", args: [note, to], batch: currentWriteBatch() });
        },
    };
    return { port, log, paths };
}

const host = (libraryArchive: ArchiveHost["settings"]["libraryArchive"] = {}): ArchiveHost & { saved: number } => {
    const h = { settings: { libraryArchive }, saved: 0, saveSettings: async () => void h.saved++ };
    return h;
};

const book = (file: string, over: Partial<ShelfItem> = {}): ShelfItem => ({ id: file, kind: "paper", format: "pdf", title: "x", file, progress: 0, highlights: 0, born: 0, lastRead: 0, ...over });

describe("archiving a book (#865 FR-8, FR-9, FR-10, AC-1, AC-7)", () => {
    it("moves the file into the archive, making the folder once, in one batch, and remembers where it was", async () => {
        const { port, log, paths } = fakeVault(["Books/Tech/x.pdf"]);
        const h = host();
        const out = await archiveItem(book("Books/Tech/x.pdf"), "Library archive", port, h, 42);
        expect(out.to).toBe("Library archive/x.pdf");
        expect(paths.has("Library archive/x.pdf")).toBe(true);
        expect(log.map((entry) => entry.op)).toEqual(["folder", "move"]);
        expect(new Set(log.map((entry) => entry.batch)).size).toBe(1);
        expect(out.batch).toBe(log[0].batch);
        expect(h.settings.libraryArchive).toEqual({ "Library archive/x.pdf": { from: "Books/Tech/x.pdf", at: 42 } });
    });

    it("never overwrites a file of the same name", async () => {
        const { port } = fakeVault(["Books/x.pdf", "Library archive/x.pdf"], ["Library archive"]);
        expect((await archiveItem(book("Books/x.pdf"), "Library archive", port, host())).to).toBe("Library archive/x 2.pdf");
    });

    it("relinks the book note in the same batch when its link went stale (FR-24, AC-18)", async () => {
        const { port, log } = fakeVault(["Books/x.pdf"], ["Library archive"], { stale: true });
        await archiveItem(book("Books/x.pdf", { note: "Library/X.md" }), "Library archive", port, host());
        expect(log.map((entry) => entry.op)).toEqual(["move", "relink"]);
        expect(log[1].args).toEqual(["Library/X.md", "Library archive/x.pdf"]);
        expect(log[0].batch).toBe(log[1].batch);
    });

    it("never relinks an article: its note is itself", async () => {
        const { port, log } = fakeVault(["Clippings/a.md"], ["Library archive"], { stale: true });
        await archiveItem(book("Clippings/a.md", { kind: "article", format: "article", note: "Clippings/a.md" }), "Library archive", port, host());
        expect(log.map((entry) => entry.op)).toEqual(["move"]);
    });

    it("remembers nothing when the move fails, and says so", async () => {
        const { port } = fakeVault(["Books/x.pdf"], ["Library archive"], { failMove: true });
        const h = host();
        await expect(archiveItem(book("Books/x.pdf"), "Library archive", port, h)).rejects.toThrow("disk full");
        expect(h.settings.libraryArchive).toEqual({});
    });

    it("refuses a saved path and an archive that is off (FR-7, FR-2)", async () => {
        const { port } = fakeVault(["Books/x.pdf"]);
        await expect(archiveItem(book("Books/x.pdf"), "", port, host())).rejects.toThrow();
        await expect(archiveItem({ ...book("Books/x.pdf"), kind: "path" }, "Library archive", port, host())).rejects.toThrow();
    });
});

describe("returning a book (#865 FR-20, AC-5, AC-6, AC-14)", () => {
    it("goes back where it came from and forgets the record", async () => {
        const { port, log } = fakeVault(["Library archive/x.pdf"], ["Library archive", "Books/Tech"], { stale: true });
        const h = host({ "Library archive/x.pdf": { from: "Books/Tech/x.pdf", at: 1 } });
        const out = await returnItem(book("Library archive/x.pdf", { note: "Library/X.md" }), "Clippings", port, h);
        expect(out?.to).toBe("Books/Tech/x.pdf");
        expect(log.map((entry) => entry.op)).toEqual(["move", "relink"]);
        expect(h.settings.libraryArchive).toEqual({});
    });

    it("lands in the vault root when nothing is known", async () => {
        const { port } = fakeVault(["Library archive/x.pdf"], ["Library archive"]);
        expect((await returnItem(book("Library archive/x.pdf"), "Clippings", port, host()))?.to).toBe("x.pdf");
    });

    it("cannot return an article while articles are off", async () => {
        const { port, log } = fakeVault(["Library archive/a.md"], ["Library archive"]);
        expect(await returnItem(book("Library archive/a.md", { kind: "article" }), "", port, host())).toBeNull();
        expect(log).toEqual([]);
    });
});

describe("Move them and Leave them (#865 FR-5, AC-11)", () => {
    it("moves every archived item in one batch, keeping where each came from", async () => {
        const { port, log } = fakeVault(["Library archive/x.pdf", "Library archive/a.md"], ["Library archive"]);
        const h = host({ "Library archive/x.pdf": { from: "Books/x.pdf", at: 1 }, "Library archive/a.md": { from: "Clippings/a.md", at: 2 } });
        await moveArchive([book("Library archive/x.pdf"), book("Library archive/a.md", { kind: "article" })], "Put away", port, h);
        expect(log.map((entry) => entry.op)).toEqual(["folder", "move", "move"]);
        expect(new Set(log.map((entry) => entry.batch)).size).toBe(1);
        expect(h.settings.libraryArchive).toEqual({ "Put away/x.pdf": { from: "Books/x.pdf", at: 1 }, "Put away/a.md": { from: "Clippings/a.md", at: 2 } });
    });

    it("leaving them writes no file and forgets their records", async () => {
        const h = host({ "Library archive/x.pdf": { from: "Books/x.pdf", at: 1 } });
        await forgetArchive(["Library archive/x.pdf"], h);
        expect(h.settings.libraryArchive).toEqual({});
        expect(h.saved).toBe(1);
    });
});

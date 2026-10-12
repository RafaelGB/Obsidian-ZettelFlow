/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TFile } from "obsidian";
import { renderThought, type Thought } from "application/thinking/thought";
import { emptyPageInk, pageInkPath, parsePageInk, putCluster, renderPageInk, type PageInk, type PageInkCluster } from "application/reader/ink/pageInk";

jest.mock("architecture/plugin/ObsidianAPI", () => ({ ObsidianApi: jest.requireActual<any>("architecture").ObsidianApi }));

import { __setMockObsidianApi } from "architecture";
import { PageInkStore } from "architecture/plugin/thinking/PageInkStore";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { bufferedWrites } from "architecture/plugin/writes/recordVaultWrite";

const disk = new Map<string, string>();
const writes = jest.fn((path: string) => path);
let folder = "Lab";

function tfile(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = path.split(".").pop() ?? "";
    f.basename = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
    (f as any).stat = { ctime: 0 };
    return f;
}

beforeEach(() => {
    disk.clear();
    writes.mockClear();
    folder = "Lab";
    __setMockObsidianApi({
        ownPlugin: { settings: { get thoughtLabPath() { return folder; } }, registerEvent: () => undefined, register: () => undefined },
        vault: {
            getAbstractFileByPath: (path: string) => (path === "Lab" || disk.has(path) ? tfile(path) : null),
            getFileByPath: (path: string) => (disk.has(path) ? tfile(path) : null),
            getMarkdownFiles: () => [...disk.keys()].filter((p) => p.endsWith(".md")).map(tfile),
            getFiles: () => [...disk.keys()].map(tfile),
            createFolder: async () => undefined,
            create: async (path: string, content: string) => {
                writes(path);
                disk.set(path, content);
                return tfile(path);
            },
            modify: async (file: TFile, content: string) => {
                writes(file.path);
                disk.set(file.path, content);
            },
            cachedRead: async (file: TFile) => disk.get(file.path) ?? "",
            read: async (file: TFile) => disk.get(file.path) ?? "",
        },
        fileManager: { trashFile: async () => undefined },
        metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
    });
});

const BOOK = "Books/Dune.epub";
const PATH = pageInkPath("Lab", BOOK);

function cluster(id: string, at = Date.now()): PageInkCluster {
    return {
        id,
        at,
        place: { view: "text", locator: { at: 0, label: "" }, quote: { exact: "w", prefix: "", suffix: "" }, side: "right", x: 0.1, line: 0, em: 16 },
        strokes: [{ colour: "pencil", pointerType: "pen", points: [{ x: 0, y: 0, p: 0.5, tilt: 1.2, t: 0 }] }],
    };
}

describe("where page ink is kept (#790 FR-4, FR-5, FR-7, AC-5)", () => {
    it("reads a book with no ink as empty, and writes nothing for it", async () => {
        const doc = await PageInkStore.getInstance().load(BOOK);
        expect(doc?.clusters).toEqual([]);
        expect(writes).not.toHaveBeenCalled();
    });

    it("writes one file per book, in the thinking space, never the book", async () => {
        const store = PageInkStore.getInstance();
        await store.save(BOOK, putCluster(emptyPageInk(BOOK), cluster("a")));
        await store.save(BOOK, putCluster(emptyPageInk(BOOK), cluster("b")));
        expect([...new Set(writes.mock.calls.map((c) => c[0]))]).toEqual([PATH]);
        expect((parsePageInk(disk.get(PATH)!) as PageInk).clusters.map((c) => c.id).sort()).toEqual(["a", "b"]);
    });

    it("merges with what is on disk first: a stroke another device synced in is never lost", async () => {
        const store = PageInkStore.getInstance();
        const mine = putCluster(emptyPageInk(BOOK), cluster("mine"));
        // Another device wrote while this one was reading.
        disk.set(PATH, renderPageInk(putCluster(emptyPageInk(BOOK), cluster("theirs"))));
        const merged = await store.save(BOOK, mine);
        expect(merged?.clusters.map((c) => c.id).sort()).toEqual(["mine", "theirs"]);
        expect((parsePageInk(disk.get(PATH)!) as PageInk).clusters.map((c) => c.id).sort()).toEqual(["mine", "theirs"]);
    });

    it("records the first save as a file created, and a later one as a replacement", async () => {
        const store = PageInkStore.getInstance();
        const seen = new Set(bufferedWrites());
        await store.save(BOOK, putCluster(emptyPageInk(BOOK), cluster("a")));
        await store.save(BOOK, putCluster(emptyPageInk(BOOK), cluster("b")));
        const mine = bufferedWrites().filter((w) => !seen.has(w) && w.path === PATH);
        expect(mine.map((w) => w.kind).sort()).toEqual(["content-replaced", "file-created"]);
    });

    it("does not write when nothing changed", async () => {
        const store = PageInkStore.getInstance();
        const doc = putCluster(emptyPageInk(BOOK), cluster("a", 5));
        await store.save(BOOK, doc);
        await store.save(BOOK, doc);
        expect(writes).toHaveBeenCalledTimes(1);
    });

    it("never writes over a file it cannot read — a newer version's, or a broken one", async () => {
        const store = PageInkStore.getInstance();
        disk.set(PATH, renderPageInk(emptyPageInk(BOOK)).replace('"v":1', '"v":9'));
        expect(await store.load(BOOK)).toBeNull();
        expect(await store.save(BOOK, putCluster(emptyPageInk(BOOK), cluster("a")))).toBeNull();
        expect(writes).not.toHaveBeenCalled();
    });

    it("keeps nothing without a thinking space", async () => {
        folder = "";
        const store = PageInkStore.getInstance();
        expect(await store.load(BOOK)).toBeNull();
        expect(await store.save(BOOK, putCluster(emptyPageInk(BOOK), cluster("a")))).toBeNull();
        expect(writes).not.toHaveBeenCalled();
    });

    it("is never read as a thought (AC-5)", async () => {
        const thoughts = ThoughtStore.getInstance();
        const highlight: Thought = { id: "h", at: 1, text: "", links: [], about: BOOK, quote: { exact: "w", prefix: "", suffix: "" } };
        disk.set("Lab/1-h.md", renderThought(highlight));
        const before = { all: (await thoughts.all()).map((t) => t.id), about: (await thoughts.highlightsAbout(BOOK)).map((t) => t.id) };
        await PageInkStore.getInstance().save(BOOK, putCluster(emptyPageInk(BOOK), cluster("a")));
        expect(disk.has(PATH)).toBe(true);
        expect((await thoughts.all()).map((t) => t.id)).toEqual(before.all);
        expect((await thoughts.highlightsAbout(BOOK)).map((t) => t.id)).toEqual(before.about);
    });
});

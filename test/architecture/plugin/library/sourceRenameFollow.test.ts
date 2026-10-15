/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TFile } from "obsidian";
import { parseThought, renderThought, type Thought } from "application/thinking/thought";
import { emptyPageInk, pageInkPath, parsePageInk, putCluster, renderPageInk, type PageInkCluster } from "application/reader/ink/pageInk";

jest.mock("architecture/plugin/ObsidianAPI", () => ({ ObsidianApi: jest.requireActual<any>("architecture").ObsidianApi }));

import { __setMockObsidianApi } from "architecture";
import { SourceRenameFollow } from "architecture/plugin/library/SourceRenameFollow";
import { PageInkStore } from "architecture/plugin/thinking/PageInkStore";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { reaboutText } from "application/library/renameFollow";
import { bufferedWrites } from "architecture/plugin/writes/recordVaultWrite";

/**
 * #810 — what you made follows a renamed book, with no Reader and no Library constructed: the
 * stores, the plugin data and the follow itself, over a vault held in a map.
 */
const disk = new Map<string, string>();
const trashed: string[] = [];
const writes = jest.fn((path: string) => path);
let failRewrite: string | null = null;

function tfile(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = path.split(".").pop() ?? "";
    f.basename = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
    (f as any).stat = { ctime: 0 };
    return f;
}

/** The metadata cache: a thought's frontmatter as Obsidian would index it. */
function frontmatterOf(path: string): Record<string, unknown> {
    const text = disk.get(path);
    if (!text || !path.endsWith(".md")) return {};
    const thought = parseThought(text, path);
    return { zfThought: { id: thought.id, at: thought.at, ...(thought.about ? { about: thought.about } : {}), ...(thought.alsoAbout ? { alsoAbout: thought.alsoAbout } : {}) } };
}

const settings: any = {};
const saveSettings = jest.fn(async () => undefined);

beforeEach(() => {
    disk.clear();
    trashed.length = 0;
    writes.mockClear();
    saveSettings.mockReset();
    saveSettings.mockImplementation(async () => undefined);
    failRewrite = null;
    for (const key of Object.keys(settings)) delete settings[key];
    Object.assign(settings, { thoughtLabPath: "Lab", articlesFolder: "Clippings" });
    __setMockObsidianApi({
        ownPlugin: { settings, registerEvent: () => undefined, register: () => undefined },
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
            process: async (file: TFile, fn: (content: string) => string) => {
                if (failRewrite && file.path.startsWith(failRewrite)) throw new Error("disk full");
                const before = disk.get(file.path) ?? "";
                const next = fn(before);
                if (next !== before) {
                    writes(file.path);
                    disk.set(file.path, next);
                }
                return next;
            },
        },
        fileManager: {
            trashFile: async (file: TFile) => {
                trashed.push(file.path);
                disk.delete(file.path);
            },
            renameFile: async (file: TFile, to: string) => {
                writes(to);
                disk.set(to, disk.get(file.path) ?? "");
                disk.delete(file.path);
            },
        },
        metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: frontmatterOf(file.path) }) },
    });
    SourceRenameFollow.getInstance().init({ settings, saveSettings });
});

const BOOK = "Books/Dune.epub";
const MOVED = "Books/Read/Dune.epub";

function thought(id: string, over: Partial<Thought> = {}): Thought {
    return {
        id,
        at: 1700000000000,
        text: "A note, with: colons — and a #tag",
        links: [],
        about: BOOK,
        quote: { exact: "the spice must flow", prefix: "he said ", suffix: " and" },
        locator: { at: 3, label: "Chapter 4", chapter: "OEBPS/ch4.xhtml" },
        meaning: "question",
        ...over,
    } as Thought;
}

function put(t: Thought): string {
    const path = `Lab/${t.at}-${t.id}.md`;
    disk.set(path, renderThought(t));
    return path;
}

function cluster(id: string, at = Date.now()): PageInkCluster {
    return {
        id,
        at,
        place: { view: "text", locator: { at: 0, label: "" }, quote: { exact: "w", prefix: "", suffix: "" }, side: "right", x: 0.1, line: 0, em: 16 },
        strokes: [{ colour: "pencil", pointerType: "pen", points: [{ x: 0, y: 0, p: 0.5, tilt: 1.2, t: 0 }] }],
    };
}

function putInk(about: string, ids: string[], erased: Record<string, number> = {}): string {
    let doc = emptyPageInk(about);
    for (const id of ids) doc = putCluster(doc, cluster(id));
    const path = pageInkPath("Lab", about);
    disk.set(path, renderPageInk({ ...doc, erased }));
    return path;
}

const follow = (from = BOOK, to = MOVED) => SourceRenameFollow.getInstance().follow(from, to);

describe("a thought follows its book, and nothing else of it changes (#810 FR-7)", () => {
    it("rewrites only the about line, byte for byte everywhere else", () => {
        const before = renderThought(thought("a1", { claims: ["Notes/Claim, one.md"], layer: "reflection" }));
        const after = reaboutText(before, BOOK, MOVED);
        expect(after).toBe(before.replace(`  about: ${BOOK}`, `  about: ${MOVED}`));
        expect(reaboutText(before, "Books/Other.epub", MOVED)).toBeNull();
    });

    it("follows a second subject too, and leaves the body alone even when it names the path", () => {
        const text = renderThought(thought("a2", { about: "Notes/x.md", alsoAbout: BOOK, text: `about: ${BOOK}` }));
        const after = reaboutText(text, BOOK, MOVED) ?? "";
        expect(parseThought(after, "p").alsoAbout).toBe(MOVED);
        expect(parseThought(after, "p").text).toBe(`about: ${BOOK}`);
    });
});

describe("a renamed book keeps what you made in it (#810 FR-1, AC-1, AC-2)", () => {
    it("moves the ink, rewrites every thought about it, and the plugin data — never the book", async () => {
        const a = put(thought("a1"));
        const b = put(thought("b2", { layer: "reflection", text: "" }));
        const other = put(thought("c3", { about: "Books/Other.epub" }));
        const otherText = disk.get(other);
        putInk(BOOK, ["k1", "k2"]);
        disk.set(MOVED, "BOOK BYTES");
        Object.assign(settings, {
            library: { [BOOK]: { size: 10, mtime: 20, chapter: 3, chapters: 9, bookmarks: [{ chapter: 2, share: 0.5, at: 1 }] } },
            readerLayers: { [BOOK]: { target: "reflection" } },
            readerResume: { [`around:${BOOK}`]: { chapter: 2, total: 5, at: 1 } },
        });

        await follow();

        expect(parseThought(disk.get(a) ?? "", a).about).toBe(MOVED);
        expect(parseThought(disk.get(b) ?? "", b).layer).toBe("reflection");
        expect(disk.get(other)).toBe(otherText);
        const inkFiles = [...disk.keys()].filter((p) => p.startsWith("Lab/ink/"));
        expect(inkFiles).toEqual([pageInkPath("Lab", MOVED)]);
        const ink = parsePageInk(disk.get(inkFiles[0]) ?? "");
        expect("unreadable" in ink ? null : ink.about).toBe(MOVED);
        expect(Object.keys(settings.library)).toEqual([MOVED]);
        expect(settings.library[MOVED].bookmarks).toHaveLength(1);
        expect(Object.keys(settings.readerLayers)).toEqual([MOVED]);
        expect(Object.keys(settings.readerResume)).toEqual([`around:${MOVED}`]);
        expect(saveSettings).toHaveBeenCalledTimes(1);
        expect(disk.get(MOVED)).toBe("BOOK BYTES");
        expect(writes).not.toHaveBeenCalledWith(MOVED);
    });

    it("records every vault change of the follow as one batch, named for the rename (FR-5, AC-6)", async () => {
        put(thought("a1"));
        put(thought("b2"));
        putInk(BOOK, ["k1"]);
        const before = bufferedWrites().length;
        await follow();
        const mine = bufferedWrites().slice(before);
        expect(mine.length).toBeGreaterThan(0);
        expect(new Set(mine.map((w: any) => w.batch)).size).toBe(1);
        expect(mine[0].origin).toEqual(expect.objectContaining({ ref: "reader-rename-follow" }));
    });

    it("renaming it back puts everything where it started (AC-6)", async () => {
        const a = put(thought("a1"));
        const text = disk.get(a);
        Object.assign(settings, { readerLayers: { [BOOK]: { target: "research" } } });
        await follow();
        await follow(MOVED, BOOK);
        expect(disk.get(a)).toBe(text);
        expect(settings.readerLayers).toEqual({ [BOOK]: { target: "research" } });
    });
});

describe("a book with nothing of yours writes nothing (#810 FR-3, AC-3, AC-4)", () => {
    it("a PDF with no ink, no thoughts and no saved state: no file, no batch, no save", async () => {
        put(thought("c3", { about: "Books/Other.epub" }));
        Object.assign(settings, { library: { "Books/Other.epub": { size: 1, mtime: 1 } } });
        const before = bufferedWrites().length;
        await follow("Books/Paper.pdf", "Papers/Paper.pdf");
        expect(writes).not.toHaveBeenCalled();
        expect(bufferedWrites().length).toBe(before);
        expect(saveSettings).not.toHaveBeenCalled();
    });

    it("a folder move, one rename per book: the two with state follow, the third writes nothing", async () => {
        put(thought("a1", { about: "Shelf/A.epub" }));
        Object.assign(settings, { library: { "Shelf/B.pdf": { size: 1, mtime: 1 } } });
        await Promise.all([follow("Shelf/A.epub", "Old/A.epub"), follow("Shelf/B.pdf", "Old/B.pdf"), follow("Shelf/C.pdf", "Old/C.pdf")]);
        expect(ThoughtStore.getInstance().aboutFiles("Old/A.epub")).toHaveLength(1);
        expect(Object.keys(settings.library)).toEqual(["Old/B.pdf"]);
        expect(writes.mock.calls.flat().some((p) => String(p).includes("C.pdf"))).toBe(false);
    });

    it("an ordinary note's rename is not a source's: its thoughts stay (scope decision)", async () => {
        const a = put(thought("a1", { about: "Notes/idea.md" }));
        await follow("Notes/idea.md", "Notes/better.md");
        expect(parseThought(disk.get(a) ?? "", a).about).toBe("Notes/idea.md");
    });
});

describe("an article follows like a book (#810 AC-8)", () => {
    it("renamed within the articles folder, its highlights and place go with it", async () => {
        const a = put(thought("a1", { about: "Clippings/Essay.md" }));
        Object.assign(settings, { library: { "Clippings/Essay.md": { size: 1, mtime: 1, chapter: 1 } } });
        await follow("Clippings/Essay.md", "Clippings/An essay.md");
        expect(parseThought(disk.get(a) ?? "", a).about).toBe("Clippings/An essay.md");
        expect(Object.keys(settings.library)).toEqual(["Clippings/An essay.md"]);
    });
});

describe("the ink, onto a path that already has some (#810 FR-4, AC-5)", () => {
    it("one file: both sides' strokes, an erase winning, the old file to the trash", async () => {
        const old = putInk(BOOK, ["k1", "k2"]);
        putInk(MOVED, ["k3", "k1"], { k2: Date.now() });
        await PageInkStore.getInstance().follow(BOOK, MOVED);
        const doc = parsePageInk(disk.get(pageInkPath("Lab", MOVED)) ?? "");
        if ("unreadable" in doc) throw new Error("unreadable");
        expect(doc.clusters.map((c) => c.id).sort()).toEqual(["k1", "k3"]);
        expect(trashed).toEqual([old]);
        expect(disk.has(old)).toBe(false);
    });

    it("a second follow finds nothing at the old path and writes nothing", async () => {
        putInk(BOOK, ["k1"]);
        await PageInkStore.getInstance().follow(BOOK, MOVED);
        writes.mockClear();
        expect(await PageInkStore.getInstance().follow(BOOK, MOVED)).toBe(false);
        expect(writes).not.toHaveBeenCalled();
    });
});

describe("a follow that fails says so once, and loses nothing (#810 FR-6, AC-7)", () => {
    it("a thought that cannot be written: logged, one Notice, the old path kept", async () => {
        const obsidian = await import("obsidian");
        const notices: string[] = [];
        const spy = jest.spyOn(obsidian as any, "Notice").mockImplementation(((message: string) => {
            notices.push(message);
            return {};
        }) as never);
        const { log } = await import("architecture/monitoring/Logger");
        const error = jest.spyOn(log, "error").mockImplementation(() => undefined);
        const a = put(thought("a1"));
        failRewrite = "Lab/";
        await follow();
        expect(parseThought(disk.get(a) ?? "", a).about).toBe(BOOK);
        expect(error).toHaveBeenCalled();
        expect(notices).toHaveLength(1);
        spy.mockRestore();
        error.mockRestore();
    });

    it("a follow that succeeds shows nothing", async () => {
        const obsidian = await import("obsidian");
        const spy = jest.spyOn(obsidian as any, "Notice");
        put(thought("a1"));
        await follow();
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("tells an open Reader where its book went", async () => {
        put(thought("a1"));
        const seen: string[] = [];
        const off = SourceRenameFollow.getInstance().onFollowed((from, to) => seen.push(`${from}→${to}`));
        await follow();
        off();
        expect(seen).toEqual([`${BOOK}→${MOVED}`]);
    });
});

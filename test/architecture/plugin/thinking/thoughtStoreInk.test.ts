/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TFile } from "obsidian";
import { renderThought, parseThought, type Thought } from "application/thinking/thought";

// The store and the file service read the same fake Obsidian.
jest.mock("architecture/plugin/ObsidianAPI", () => ({ ObsidianApi: jest.requireActual<any>("architecture").ObsidianApi }));

import { __setMockObsidianApi } from "architecture";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { bufferedWrites, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";

/** The vault, as files by path; a write, a read and a trash all land here. */
const disk = new Map<string, string>();
const trashed: string[] = [];
const fronts = new Map<string, Record<string, unknown>>();

function tfile(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = path.split(".").pop() ?? "";
    f.basename = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
    (f as any).stat = { ctime: 0 };
    return f;
}

const writes = jest.fn((path: string) => path);

beforeEach(() => {
    disk.clear();
    trashed.length = 0;
    fronts.clear();
    writes.mockClear();
    __setMockObsidianApi({
        ownPlugin: { settings: { thoughtLabPath: "Lab" }, registerEvent: () => undefined, register: () => undefined },
        vault: {
            getAbstractFileByPath: (path: string) => (path === "Lab" || disk.has(path) ? tfile(path) : null),
            getFileByPath: (path: string) => (disk.has(path) ? tfile(path) : null),
            getMarkdownFiles: () => [...disk.keys()].filter((p) => p.endsWith(".md")).map(tfile),
            createFolder: async () => undefined,
            create: async (path: string, content: string) => {
                writes(path);
                disk.set(path, content);
                fronts.set(path, (parseThought(content, path) as any).ink ? { inkDrawing: "x", quoteExact: "w", about: "Books/a.epub" } : {});
                return tfile(path);
            },
            modify: async (file: TFile, content: string) => {
                writes(file.path);
                disk.set(file.path, content);
            },
            cachedRead: async (file: TFile) => disk.get(file.path) ?? "",
        },
        fileManager: {
            trashFile: async (file: TFile) => {
                trashed.push(file.path);
                disk.delete(file.path);
            },
        },
        metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: { zfThought: fronts.get(file.path) } }) },
    });
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><metadata id="zettelflow-ink">{"v":1,"strokes":[]}</metadata></svg>';
const input = {
    about: "Books/a.epub",
    quote: { exact: "interface", prefix: "its ", suffix: " is" },
    locator: { at: 2, label: "Ch. 3" },
    ink: { side: "right" as const, x: 0.2, line: 0.5, em: 16 },
};

describe("the store learns the drawing (#745 E7, AC-5, FR-10, FR-14)", () => {
    it("writes the thought and its drawing with the same name, as one batch", async () => {
        const store = ThoughtStore.getInstance();
        const before = bufferedWrites().length;
        const thought = await withWriteBatch({ kind: "manual", ref: "reader-ink", label: "Books/a.epub" }, () => store.writeInk(input, SVG));
        expect(thought?.ink?.drawing).toMatch(/^\d+-[\w-]+\.svg$/);
        const paths = writes.mock.calls.map((call) => call[0]);
        expect(paths).toHaveLength(2);
        expect(paths[0]).toMatch(/^Lab\/\d+-[\w-]+\.md$/);
        expect(paths[1]).toBe(paths[0].replace(/\.md$/, ".svg"));
        expect(disk.get(paths[1])).toBe(SVG);
        // The book is in no write.
        expect(paths.some((p) => p.includes("a.epub"))).toBe(false);
        const record = bufferedWrites().slice(before);
        expect(record.map((w) => w.kind).sort()).toEqual(["file-created", "note-created"]);
        expect(new Set(record.map((w) => w.batch)).size).toBe(1);
    });

    it("reads the drawing back, and says nothing when it is not there", async () => {
        const store = ThoughtStore.getInstance();
        const thought = (await store.writeInk(input, SVG))!;
        expect(await store.drawingOf(thought)).toBe(SVG);
        const missing: Thought = { ...thought, id: "gone", ink: { ...thought.ink!, drawing: "nope.svg" } };
        expect(await store.drawingOf(missing)).toBeUndefined();
        expect(await store.drawingOf({ id: "p", at: 0, text: "", links: [] })).toBeUndefined();
    });

    it("throws both away to the trash, returns the drawing, and puts both back", async () => {
        const store = ThoughtStore.getInstance();
        const thought = (await store.writeInk(input, SVG))!;
        const drawing = await store.discard(thought);
        expect(drawing).toBe(SVG);
        expect(trashed).toHaveLength(2);
        expect(trashed.some((p) => p.endsWith(".svg"))).toBe(true);
        expect(disk.size).toBe(0);
        await store.restore(thought, drawing);
        expect([...disk.keys()].sort()).toEqual(trashed.slice().sort());
        expect(parseThought(disk.get(trashed.find((p) => p.endsWith(".md"))!)!, "x").ink).toEqual(thought.ink);
    });

    it("re-writes the drawing after an erase", async () => {
        const store = ThoughtStore.getInstance();
        const thought = (await store.writeInk(input, SVG))!;
        await store.saveDrawing(thought, "<svg/>");
        expect(await store.drawingOf(thought)).toBe("<svg/>");
    });

    it("counts highlights, never ink", async () => {
        const store = ThoughtStore.getInstance();
        await store.writeInk(input, SVG);
        const highlight: Thought = { id: "h", at: 1, text: "", links: [], about: "Books/a.epub", quote: { exact: "w", prefix: "", suffix: "" } };
        disk.set("Lab/1-h.md", renderThought(highlight));
        fronts.set("Lab/1-h.md", { quoteExact: "w", about: "Books/a.epub" });
        expect(store.highlightCounts().get("Books/a.epub")).toBe(1);
    });
});

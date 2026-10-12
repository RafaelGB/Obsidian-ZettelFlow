/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { makePdfJs, prose, type FakePage } from "../../../../support/fakePdf";
import { pointerDown, pointerMove, pointerUp } from "../../../../support/pointer";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";
import { __setMockObsidianApi } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import * as exportSave from "architecture/components/core/export/saveExport";
import * as undo from "architecture/plugin/writes/undoNotice";
import { bufferedWrites, currentWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import type { Thought } from "application/thinking/thought";

/**
 * **Snapshot a figure or a table** (#763), through the Reader over a fake pdf.js in Page view: the
 * mode and its door, the drag, the card and nothing written before a choice, each destination as one
 * recorded batch, and the flight that becomes the card's picture. The fake DOM has no layout: the
 * stage is given a size and each page's slot sits where its custom properties put it.
 */

const PATH = "Papers/paper.pdf";
const cls = (name: string) => `zettelkasten-flow__${name}`;
const VIEW = { width: 1000, height: 700 };
const proto = DomNode.prototype as any;
const g = globalThis as any;
const originalRect = proto.getBoundingClientRect;
const px = (value: string | undefined) => Number.parseFloat(value ?? "0") || 0;

function stageOf(node: DomNode): DomNode | null {
    for (let cur: DomNode | null = node; cur; cur = cur.parent) if (cur.classes.has(cls("reader-stage"))) return cur;
    return null;
}

const canvases: any[] = [];

beforeAll(() => {
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this.classes.has(cls("reader-stage")) || this.classes.has(cls("reader"))) return { left: 0, top: 0, width: VIEW.width, height: VIEW.height };
        if (this.classes.has(cls("reader-pv-run"))) {
            const stage = stageOf(this) as any;
            return { left: -(stage?.scrollLeft ?? 0), top: -(stage?.scrollTop ?? 0), width: 0, height: 0 };
        }
        if (this.classes.has(cls("reader-pv-slot"))) {
            const run = (this.parent as any)?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
            return { left: run.left + px(this.cssProps["--zf-slot-x"]), top: run.top + px(this.cssProps["--zf-slot-y"]), width: px(this.cssProps["--zf-slot-w"]), height: px(this.cssProps["--zf-slot-h"]) };
        }
        if (this.classes.has(cls("reader-snapshot-img"))) return { left: 700, top: 60, width: 270, height: 180 };
        if (this.classes.has(cls("reader-margin"))) return { left: 0, top: 0, width: 0, height: 0 };
        return originalRect.call(this);
    };
    proto.getContext = function () {
        return { drawImage: () => undefined };
    };
    proto.setPointerCapture = () => undefined;
    // A canvas gives a PNG (FR-3): only a capture's scratch canvas is ever asked for one.
    proto.toBlob = function (this: DomNode, done: (b: Blob) => void, type: string) {
        canvases.push(this);
        done(new Blob(["png"], { type }));
    };
});

afterAll(() => {
    proto.getBoundingClientRect = originalRect;
    delete proto.getContext;
    delete proto.setPointerCapture;
    delete proto.toBlob;
    __setPdfJs(null);
});

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.basename = f.name.replace(/\.[^.]+$/, "");
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const paper = (): FakePage[] => [{ runs: prose(["Figure 1 shows the forecasts by project type,", "against what the projects cost."]) }, { runs: prose(["Table 2 lists the outcomes."]) }];

function mount() {
    const fake = makePdfJs({ pages: paper(), info: { Title: "Reference class forecasting" } });
    __setPdfJs(fake.lib);
    const pdf = file(PATH);
    const note = file("Notes/Planning.md");
    const files = new Map<string, TFile>([
        [pdf.path, pdf],
        [note.path, note],
    ]);
    const vault: any = {
        getAbstractFileByPath: (path: string) => files.get(path) ?? null,
        getFileByPath: (path: string) => files.get(path) ?? null,
        readBinary: async () => new ArrayBuffer(4),
        cachedRead: async () => "",
        modify: jest.fn(),
        modifyBinary: jest.fn(),
        create: jest.fn(async (path: string) => {
            const made = file(path);
            files.set(path, made);
            return made;
        }),
        createBinary: jest.fn(async (path: string) => {
            const made = file(path);
            files.set(path, made);
            return made;
        }),
        createFolder: jest.fn(async () => undefined),
        process: jest.fn(async () => ""),
        adapter: { exists: async () => true },
        getResourcePath: (f: TFile) => `app://local/${f.path}`,
    };
    const app: any = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        metadataCache: { getFirstLinkpathDest: (link: string) => files.get(link) ?? [...files.values()].find((f) => f.name === link) ?? null, on: () => ({}) },
        fileManager: {
            processFrontMatter: jest.fn(),
            renameFile: jest.fn(),
            getAvailablePathForAttachment: async (name: string) => `Attachments/${name}`,
            getNewFileParent: () => ({ path: "Notes" }),
            generateMarkdownLink: (f: TFile) => `[[${f.name}]]`,
        },
    };
    __setMockObsidianApi({ vault, metadataCache: app.metadataCache, fileManager: app.fileManager });
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "stack" } } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const written: Thought[] = [];
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async (text: string, options: any) => {
            const thought = { id: `t${written.length + 1}`, text, created: "2026-10-12", ...options } as Thought;
            written.push(thought);
            return thought;
        }),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const picked: { chosen?: (path: string) => void } = {};
    const view = new ReaderView(leaf, host, { store }, {}, {}, {}, {}, {}, {}, { pickNote: (_app, chosen) => (picked.chosen = chosen) });
    return { view, content, app, vault, store, written, picked, calls: fake.calls, files };
}

async function open(layout: "page" | "reading" = "page") {
    const m = mount();
    await m.view.setState({ source: PATH, chapter: 0, ...(layout === "page" ? { layout: "page" } : {}) }, {} as never);
    await m.view.onOpen();
    await settle(() => (layout === "page" ? m.content.byClass("reader-pv-slot").length > 0 : m.content.byClass("reader-source-body").length > 0));
    await flush();
    const stage = m.content.oneByClass("reader-stage");
    const root = m.content.oneByClass("reader");
    return { ...m, stage, root };
}

const snapButton = (content: DomNode) => content.find((el) => el.tag === "button" && el.getAttribute("aria-label") === "Snapshot")!;
const card = (content: DomNode) => content.byClass("reader-snapshot-card")[0];
const buttonIn = (node: DomNode, text: string) => node.find((el) => el.tag === "button" && el.textContent === text)!;

/** A drag on the page from one corner to the other, with the mouse. */
function drag(stage: DomNode, from: { x: number; y: number }, to: { x: number; y: number }) {
    const down = pointerDown(stage, from, "mouse");
    const move = pointerMove(stage, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 16, "mouse");
    const moved = pointerMove(stage, to, 16, "mouse");
    const up = pointerUp(stage, to, 16, "mouse");
    return { down, move, moved, up };
}

describe("Snapshot in Page view (#763)", () => {
    let rec: AnimationRecord;
    let motion: () => void;
    beforeEach(() => {
        resetReaderWorkspace();
        canvases.length = 0;
        rec = recordAnimations();
        motion = reducedMotion(false);
        g.getSelection = () => ({ isCollapsed: true, toString: () => "", removeAllRanges: () => undefined });
    });
    afterEach(() => {
        endChapterTurn();
        rec.stop();
        motion();
        delete g.getSelection;
        jest.restoreAllMocks();
    });

    describe("the mode (AC-6, FR-1, FR-4)", () => {
        it("is offered in Page view only", async () => {
            const reading = await open("reading");
            expect(snapButton(reading.content).classes.has(cls("reader-hidden"))).toBe(true);
            await reading.view.onClose();
            const page = await open("page");
            expect(snapButton(page.content).classes.has(cls("reader-hidden"))).toBe(false);
            await page.view.onClose();
        });

        it("is entered from the bar and left with Esc or the button again", async () => {
            const { view, content, root } = await open();
            const button = snapButton(content);
            button.click();
            expect(root.classes.has(cls("reader--snapshot"))).toBe(true);
            expect(button.getAttribute("aria-pressed")).toBe("true");
            press({ view }, "Escape");
            expect(root.classes.has(cls("reader--snapshot"))).toBe(false);
            expect(button.getAttribute("aria-pressed")).toBe("false");
            // Esc left the mode, never the Reader.
            expect(content.byClass("reader-stage")).toHaveLength(1);
            button.click();
            button.click();
            expect(root.classes.has(cls("reader--snapshot"))).toBe(false);
            await view.onClose();
        });

        it("turns a drag into a rectangle: no selection, no scroll, nothing else moves (FR-9)", async () => {
            const { view, content, stage, root } = await open();
            snapButton(content).click();
            const before = rec.animations.length;
            const down = pointerDown(stage, { x: 200, y: 150 }, "touch");
            const move = pointerMove(stage, { x: 420, y: 330 }, 16, "touch");
            expect(down.defaultPrevented).toBe(true);
            expect(move.defaultPrevented).toBe(true);
            const rect = root.oneByClass("reader-snapshot-rect");
            expect(rect.cssProps).toMatchObject({ "--zf-snap-x": "200px", "--zf-snap-y": "150px", "--zf-snap-w": "220px", "--zf-snap-h": "180px" });
            // Nothing animates while you drag, and nothing is dimmed.
            expect(rec.animations.length).toBe(before);
            expect(content.byClass("reader-snapshot-dim")).toHaveLength(0);
            pointerUp(stage, { x: 420, y: 330 }, 16, "touch");
            await view.onClose();
        });

        it("captures nothing from a tap, and says how", async () => {
            const { view, content, stage } = await open();
            snapButton(content).click();
            pointerDown(stage, { x: 300, y: 300 }, "mouse");
            pointerUp(stage, { x: 305, y: 302 }, 30, "mouse");
            await flush();
            expect(content.oneByClass("reader-snapshot-hint").textContent).toBe("Drag around a figure or a table");
            expect(card(content)).toBeUndefined();
            expect(canvases).toHaveLength(0);
            await view.onClose();
        });

        it("and the ink palette never share the page: one closes the other", async () => {
            const { view, content, root } = await open();
            press({ view }, "P");
            const palette = content.oneByClass("reader-ink-palette");
            expect(palette.classes.has("is-open")).toBe(true);
            snapButton(content).click();
            expect(palette.classes.has("is-open")).toBe(false);
            expect(root.classes.has(cls("reader--snapshot"))).toBe(true);
            press({ view }, "P");
            expect(root.classes.has(cls("reader--snapshot"))).toBe(false);
            await view.onClose();
        });
    });

    async function captured(options: { motion?: boolean } = {}) {
        const m = await open();
        snapButton(m.content).click();
        const writes = bufferedWrites().length;
        const renders = m.calls.renders.length;
        drag(m.stage, { x: 150, y: 120 }, { x: 450, y: 320 });
        await settle(() => card(m.content) !== undefined);
        if (options.motion !== false) rec.finishAll();
        return { ...m, writes, renders };
    }

    describe("the card, and nothing written yet (AC-3, AC-5, FR-5)", () => {
        it("draws the region again at twice its size on screen, and shows it in a card with where it goes", async () => {
            const { view, content, calls, renders, writes, root } = await captured();
            // A new drawing of the page, never the screen's pixels.
            // A new drawing of the page, at twice the CSS pixels a point is shown at, moved to the region.
            const slot = content.oneByClass("reader-pv-slot");
            const onScreen = px(slot.cssProps["--zf-slot-w"]) / 612;
            const capture = calls.renders.slice(renders).find((r) => Math.abs(r.scale - 2 * onScreen) < 1e-6);
            expect(capture).toBeDefined();
            expect(capture!.offsetX).toBeLessThan(0);
            expect(canvases).toHaveLength(1);
            const shown = card(content);
            expect(shown.oneByClass("reader-snapshot-title").textContent).toBe("Figure · p. 1");
            const labels = shown.findAll((el) => el.tag === "button" && el.textContent !== "").map((el) => el.textContent);
            expect(labels).toEqual(["Add note", "Fleeting note", "Attach to a note", "Cancel"]);
            expect(bufferedWrites().length).toBe(writes);
            // One drag, one capture: the mode is left.
            expect(root.classes.has(cls("reader--snapshot"))).toBe(false);
            expect(canvases.every((canvas) => canvas.width === 0)).toBe(true);
            await view.onClose();
        });

        it("Cancel writes nothing, and the card sinks back and fades (FR-11)", async () => {
            const revoke = jest.spyOn(URL, "revokeObjectURL");
            const { view, content, vault, writes } = await captured();
            const at = rec.animations.length;
            buttonIn(card(content), "Cancel").click();
            const sink = rec.animations[at];
            expect(sink.options.duration).toBe(MOTION.base);
            expect(sink.keyframes[sink.keyframes.length - 1]).toEqual({ transform: "translateY(8px)", opacity: 0 });
            sink.finish();
            expect(card(content)).toBeUndefined();
            expect(bufferedWrites().length).toBe(writes);
            expect(vault.createBinary).not.toHaveBeenCalled();
            expect(vault.create).not.toHaveBeenCalled();
            await new Promise((resolve) => setTimeout(resolve, MOTION.cover + 350));
            expect(revoke).toHaveBeenCalled();
            await view.onClose();
        });

        it("Esc on the card is its Cancel", async () => {
            const { view, content, writes } = await captured();
            press({ view }, "Escape");
            rec.finishAll();
            expect(card(content)).toBeUndefined();
            expect(bufferedWrites().length).toBe(writes);
            expect(content.byClass("reader-stage")).toHaveLength(1);
            await view.onClose();
        });
    });

    describe("one choice, one batch, one Undo (AC-4, AC-5)", () => {
        it("Add note: a preview grows from the card; Create note writes the image and the note in one batch", async () => {
            const batches: (string | undefined)[] = [];
            const saveExport = jest.spyOn(exportSave, "saveExportToVault");
            const create = jest.spyOn(FileService, "createFile");
            saveExport.mockImplementation(async (blob, name) => {
                batches.push(currentWriteBatch());
                return (await FileService.writeBinaryFile(`Attachments/${name}.png`, await blob.arrayBuffer())) as never;
            });
            const { view, content, vault } = await captured();
            const at = rec.animations.length;
            buttonIn(card(content), "Add note").click();
            const grow = rec.animations[at];
            expect(grow.keyframes[0]).toEqual({ transform: "scale(0.96)", opacity: 0 });
            expect(grow.keyframes[1]).toEqual({ transform: "scale(1)", opacity: 1 });
            expect(card(content).oneByClass("reader-snapshot-source").textContent).toBe("source:: [[Papers/paper.pdf#page=1|Reference class forecasting]] p. 1");
            // Still nothing written: the preview is a preview.
            expect(vault.createBinary).not.toHaveBeenCalled();
            const caption = card(content).oneByClass("reader-snapshot-caption") as any;
            caption.value = "Forecasts against outcomes";
            create.mockImplementation(async (path: string, body: string) => {
                batches.push(currentWriteBatch());
                expect(body).toBe("![[Reference class forecasting p. 1.png]]\n\nForecasts against outcomes\n\nsource:: [[Papers/paper.pdf#page=1|Reference class forecasting]] p. 1\n");
                return {} as never;
            });
            buttonIn(card(content), "Create note").click();
            await settle(() => card(content)?.byClass("reader-snapshot-status").length > 0);
            expect(saveExport).toHaveBeenCalledWith(expect.anything(), "Reference class forecasting p. 1");
            expect(create.mock.calls[0][0]).toBe("Notes/Reference class forecasting p. 1.md");
            expect(batches).toHaveLength(2);
            expect(batches[0]).toBeTruthy();
            expect(batches[1]).toBe(batches[0]);
            expect(card(content).oneByClass("reader-snapshot-status").find((el) => el.tag === "span")?.textContent).toBe("Created Reference class forecasting p. 1");
            // The image is on the record in that batch, so one Undo takes it with the note.
            expect(bufferedWrites().filter((w) => w.batch === batches[0]).map((w) => w.path)).toContain("Attachments/Reference class forecasting p. 1.png");
            const undone = jest.spyOn(undo, "undoBatch").mockResolvedValue({ hadWork: true, done: 2, failed: [] });
            buttonIn(card(content), "Undo").click();
            await flush();
            expect(undone).toHaveBeenCalledWith(batches[0]);
            await view.onClose();
        });

        it("Fleeting note: the image and the thought in one batch, under Notes on this page", async () => {
            const { view, content, store, written } = await captured();
            const at = rec.animations.length;
            buttonIn(card(content), "Fleeting note").click();
            await settle(() => written.length > 0 && content.byClass("reader-snapshot-status").length > 0);
            expect(written[0].text).toBe("![[Reference class forecasting p. 1.png]]");
            expect((store.write as jest.Mock).mock.calls[0][1]).toMatchObject({ about: PATH, locator: { at: 0, label: "p. 1", chapter: "page:0", page: "1" } });
            // The thought and the image went on the record together.
            const batch = bufferedWrites().find((w) => w.path === "Attachments/Reference class forecasting p. 1.png")?.batch;
            expect(batch).toBeTruthy();
            // Listed at once, as its picture, and the snapshot flew into that row.
            const row = content.oneByClass("reader-margin").find((el) => el.getAttribute("data-note") === "t1")!;
            expect(row.oneByClass("reader-hl-snapshot").getAttribute("src")).toBe("app://local/Attachments/Reference class forecasting p. 1.png");
            expect(rec.animations.slice(at).some((a) => a.target.classes?.has(cls("reader-snapshot-ghost")))).toBe(true);
            jest.spyOn(undo, "undoBatch").mockResolvedValue({ hadWork: true, done: 2, failed: [] });
            buttonIn(card(content), "Undo").click();
            await flush();
            expect(content.oneByClass("reader-margin").find((el) => el.getAttribute("data-note") === "t1")).toBeUndefined();
            await view.onClose();
        });

        it("Attach to a note: Obsidian's picker, then the image and the lines at the note's end in one batch", async () => {
            const batches: (string | undefined)[] = [];
            const append = jest.spyOn(FileService, "appendTo").mockImplementation(async (_file, text) => {
                batches.push(currentWriteBatch());
                expect(text).toBe("![[Reference class forecasting p. 1.png]]\nsource:: [[Papers/paper.pdf#page=1|Reference class forecasting]] p. 1");
            });
            const { view, content, vault, picked, app } = await captured();
            buttonIn(card(content), "Attach to a note").click();
            // Nothing written while the picker is open.
            expect(vault.createBinary).not.toHaveBeenCalled();
            picked.chosen?.("Notes/Planning.md");
            await settle(() => content.byClass("reader-snapshot-status").length > 0);
            expect(append).toHaveBeenCalledTimes(1);
            const image = bufferedWrites().find((w) => w.path === "Attachments/Reference class forecasting p. 1.png");
            expect(image?.batch).toBe(batches[0]);
            const status = content.oneByClass("reader-snapshot-status");
            expect(status.find((el) => el.tag === "span")?.textContent).toBe("Attached to Planning");
            buttonIn(status, "Open").click();
            expect(app.workspace.openLinkText).toHaveBeenCalledWith("Notes/Planning.md", "", "tab");
            await view.onClose();
        });

        it("never writes the book (AC-5)", async () => {
            const { view, content, vault, picked } = await captured();
            jest.spyOn(FileService, "appendTo").mockResolvedValue(undefined);
            buttonIn(card(content), "Attach to a note").click();
            picked.chosen?.("Notes/Planning.md");
            await settle(() => content.byClass("reader-snapshot-status").length > 0);
            const touched = [...vault.modify.mock.calls, ...vault.modifyBinary.mock.calls, ...vault.process.mock.calls, ...vault.create.mock.calls, ...vault.createBinary.mock.calls].map((call: any[]) => (typeof call[0] === "string" ? call[0] : call[0]?.path));
            expect(touched).not.toContain(PATH);
            expect(bufferedWrites().some((w) => w.path === PATH)).toBe(false);
            await view.onClose();
        });
    });

    describe("the flight becomes the card's picture (AC-7, FR-10, FR-12)", () => {
        it("lifts the region and flies it to the card, whole to the end, then shows the card's own picture", async () => {
            const { view, content, root } = await captured({ motion: false });
            const flight = rec.animations.find((a) => a.target.classes?.has(cls("reader-snapshot-ghost")))!;
            expect(flight.options.duration).toBe(MOTION.cover);
            expect(flight.keyframes[1]).toMatchObject({ offset: 0.2, opacity: 1 });
            expect(String(flight.keyframes[1].transform)).toContain("scale(1.02, 1.02)");
            expect(flight.keyframes[flight.keyframes.length - 1].opacity).toBe(1);
            for (const frame of flight.keyframes) for (const key of Object.keys(frame)) expect(["transform", "opacity", "offset"]).toContain(key);
            const img = card(content).oneByClass("reader-snapshot-img");
            const ghost = flight.target as DomNode;
            // The same picture: the ghost and the card show one URL, and the card's waits for the landing.
            expect(ghost.getAttribute("src")).toBe(img.getAttribute("src"));
            expect(img.classes.has(cls("reader-snapshot-img--waiting"))).toBe(true);
            flight.finish();
            expect(img.classes.has(cls("reader-snapshot-img--waiting"))).toBe(false);
            expect(root.children).not.toContain(ghost);
            await view.onClose();
        });

        it("lands at once when a key is pressed mid-flight", async () => {
            const listeners = new Map<string, ((event: unknown) => void)[]>();
            g.addEventListener = (name: string, fn: (event: unknown) => void) => listeners.set(name, [...(listeners.get(name) ?? []), fn]);
            g.removeEventListener = (name: string, fn: (event: unknown) => void) => listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn));
            try {
                const { view, content } = await captured({ motion: false });
                const flight = rec.animations.find((a) => a.target.classes?.has(cls("reader-snapshot-ghost")))!;
                for (const fn of listeners.get("keydown") ?? []) fn({ key: "ArrowRight" });
                expect(flight.playState).toBe("finished");
                expect(card(content).oneByClass("reader-snapshot-img").classes.has(cls("reader-snapshot-img--waiting"))).toBe(false);
                await view.onClose();
            } finally {
                delete g.addEventListener;
                delete g.removeEventListener;
            }
        });

        it("under reduced motion the card is simply there, and nothing animates", async () => {
            motion();
            motion = reducedMotion(true);
            const m = await open();
            snapButton(m.content).click();
            const before = rec.animations.length;
            drag(m.stage, { x: 150, y: 120 }, { x: 450, y: 320 });
            await settle(() => card(m.content) !== undefined);
            expect(rec.animations.length).toBe(before);
            expect(card(m.content).oneByClass("reader-snapshot-img").classes.has(cls("reader-snapshot-img--waiting"))).toBe(false);
            buttonIn(card(m.content), "Cancel").click();
            expect(card(m.content)).toBeUndefined();
            expect(rec.animations.length).toBe(before);
            await m.view.onClose();
        });
    });
});

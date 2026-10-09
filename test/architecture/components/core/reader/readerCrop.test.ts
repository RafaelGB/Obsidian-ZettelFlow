/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { makePdfJs, type FakePage } from "../../../../support/fakePdf";
import { cropPaper, PAGE_H, PAGE_W } from "../../../../support/pdfCropPaper";
import { recordAnimations, reducedMotion, type FakeAnimation } from "../../../../support/motionDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { log } from "architecture";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/**
 * **Crop margins** (#769), through the Reader with a fake pdf.js whose pages carry pdf.js 5.3's
 * operator lists: the switch and where it is (FR-1, FR-7), the scan (FR-4), measuring and the one
 * camera move (FR-9, FR-10), reduced motion (FR-11), kept per paper and nothing written (FR-6,
 * AC-5), and everything else on a cropped page — layouts, render offsets, links, thumbnails, jumps
 * and a turned page (FR-5).
 */

const PATH = "Papers/book.pdf";
const cls = (name: string) => `zettelkasten-flow__${name}`;
const VIEW = { width: 800, height: 600 };
const proto = DomNode.prototype as any;
const originalRect = proto.getBoundingClientRect;

function stageOf(node: DomNode): DomNode | null {
    for (let cur: DomNode | null = node; cur; cur = cur.parent) if (cur.classes.has(cls("reader-stage"))) return cur;
    return null;
}

beforeAll(() => {
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this.classes.has(cls("reader-stage"))) return { left: 0, top: 0, width: VIEW.width, height: VIEW.height };
        if (this.classes.has(cls("reader-pv-run"))) {
            const stage = stageOf(this) as any;
            return { left: -(stage?.scrollLeft ?? 0), top: -(stage?.scrollTop ?? 0), width: 0, height: 0 };
        }
        return originalRect.call(this);
    };
    proto.getContext = function () {
        return { drawImage: () => undefined };
    };
});

afterAll(() => {
    proto.getBoundingClientRect = originalRect;
    delete proto.getContext;
    __setPdfJs(null);
});

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

interface Options {
    hold?: boolean;
    fail?: boolean;
    layout?: string;
    links?: boolean;
}

/** The sample paper; page 3 (index 2) links to page 9 near its top, and out to an address. */
function book(options: Options): FakePage[] {
    const pages = cropPaper();
    if (options.links) {
        pages[2].links = [
            { rect: [130, 700, 300, 712], dest: [{ num: 8 }, { name: "XYZ" }, 0, 700, 0] },
            { rect: [130, 676, 300, 688], url: "https://doi.org/10.1145/564585.564601" },
        ];
    }
    return pages;
}

function mount(pages: FakePage[], settings: Record<string, any>, options: Options) {
    const fake = makePdfJs({ pages, info: { Title: "On replicas" }, holdOps: options.hold, failOps: options.fail });
    __setPdfJs(fake.lib);
    const pdf = file(PATH);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === pdf.path ? pdf : null),
        readBinary: async () => new ArrayBuffer(4),
        cachedRead: async () => "",
        modify: jest.fn(),
        modifyBinary: jest.fn(),
        create: jest.fn(),
        createBinary: jest.fn(),
        process: jest.fn(),
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
        fileManager: { processFrontMatter: jest.fn(), renameFile: jest.fn() },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "stack" }, ...settings } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const view = new ReaderView(leaf, host, { store });
    return { view, content, host, vault, app, calls: fake.calls, store };
}

async function open(settings: Record<string, any> = {}, options: Options = {}, pages?: FakePage[]) {
    const m = mount(pages ?? book(options), settings, options);
    await m.view.setState({ source: PATH, chapter: 0, ...(options.layout === "reading" ? {} : { layout: "page" }) }, {} as never);
    await m.view.onOpen();
    await settle(() => m.content.byClass("reader-next").length > 0);
    await flush();
    const stage = m.content.oneByClass("reader-stage") as any;
    return { ...m, stage };
}

const run = (content: DomNode) => content.oneByClass("reader-stage").oneByClass("reader-pv-run");
const slots = (content: DomNode) => run(content).byClass("reader-pv-slot");
const slotOf = (content: DomNode, page: number) => slots(content).find((slot) => slot.getAttribute("data-page") === String(page));
const num = (value: string | undefined) => Number((value ?? "0").replace(/px|%/, ""));
const box = (slot: DomNode) => ({ x: num(slot.cssProps["--zf-slot-x"]), y: num(slot.cssProps["--zf-slot-y"]), w: num(slot.cssProps["--zf-slot-w"]), h: num(slot.cssProps["--zf-slot-h"]) });
const typePanel = (content: DomNode) => content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Type")!.click();
const cropSwitch = (content: DomNode) => content.byText("Crop margins")?.parent ?? null;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const kept = (host: { settings: Record<string, any> }) => host.settings.library?.[PATH]?.view ?? {};
const cameraMoves = (animations: FakeAnimation[]) => animations.filter((a) => (a.target as DomNode).classes?.has(cls("reader-pv-crop-camera")));

const g0 = globalThis as any;
g0.addEventListener ??= () => undefined;
g0.removeEventListener ??= () => undefined;

/** Turn crop on from the Type panel, and wait for the paper to be measured. */
async function cropOn(m: { content: DomNode; calls: any }) {
    typePanel(m.content);
    cropSwitch(m.content)!.click();
    await settle(() => cropSwitch(m.content)?.getAttribute("aria-pressed") === "true");
    await flush();
}

/** Where the middle of the screen is on its page, as shares of the whole page. */
function pointAtMiddle(content: DomNode, stage: any, frame = { x: 0, y: 0, w: 1, h: 1 }) {
    const y = stage.scrollTop + VIEW.height / 2;
    const x = stage.scrollLeft + VIEW.width / 2;
    const slot = slots(content)
        .map((el) => ({ page: Number(el.getAttribute("data-page")), ...box(el) }))
        .find((s) => y >= s.y && y <= s.y + s.h)!;
    return { page: slot.page, fx: frame.x + ((x - slot.x) / slot.w) * frame.w, fy: frame.y + ((y - slot.y) / slot.h) * frame.h, slot };
}

describe("Crop margins is a switch in Page view's group, and nowhere else (#769 FR-1, FR-4, FR-7)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("is in the Page view group, off", async () => {
        const { content } = await open();
        typePanel(content);
        const button = cropSwitch(content)!;
        expect(button).toBeDefined();
        expect(button.getAttribute("aria-pressed")).toBe("false");
        expect(content.oneByClass("reader-type-section").textContent).toBe("Page view");
    });

    it("is not in Reading view", async () => {
        const { content } = await open({}, { layout: "reading" });
        typePanel(content);
        expect(cropSwitch(content)).toBeNull();
    });

    it("is not available in a scan, and says why in one line; nothing is measured", async () => {
        const scan = Array.from({ length: 3 }, () => ({ runs: [] }));
        const settings = { library: { [PATH]: { size: 10, mtime: 20, chapters: 3, imageOnly: true } } };
        const { content, calls } = await open(settings, { layout: "reading" }, scan);
        typePanel(content);
        const button = cropSwitch(content)!;
        expect(button.getAttribute("disabled")).toBe("true");
        expect(content.byText("Cropping needs a page's text, and this PDF has none.")).toBeDefined();
        button.click();
        await flush();
        expect(calls.opLists).toHaveLength(0);
    });
});

describe("the paper is measured once, then the camera moves in (#769 FR-9, FR-10, FR-11)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("says it is working while it measures, and nothing on the page moves; then one camera move", async () => {
        const undo = reducedMotion(false);
        const record = recordAnimations();
        try {
            const m = await open({}, { hold: true });
            const { content, calls, stage } = m;
            stage.scrollTop = 1200;
            stage.fire("scroll", {});
            await wait(40);
            await flush();
            const before = pointAtMiddle(content, stage);
            const props = slots(content).map((slot) => JSON.stringify(slot.cssProps));
            typePanel(content);
            cropSwitch(content)!.click();
            await settle(() => calls.opLists.length >= 12);
            // Measuring: the switch says so, every sampled page is read, and nothing moved.
            expect(cropSwitch(content)!.getAttribute("aria-busy")).toBe("true");
            expect(content.byText("Measuring the margins…")).toBeDefined();
            expect(new Set(calls.opLists)).toEqual(new Set(Array.from({ length: 12 }, (_, i) => i + 1)));
            expect(slots(content).map((slot) => JSON.stringify(slot.cssProps))).toEqual(props);
            expect(cameraMoves(record.animations)).toHaveLength(0);
            const fromBox = { left: before.slot.x - stage.scrollLeft, top: before.slot.y - stage.scrollTop, width: before.slot.w, height: before.slot.h };
            calls.releaseOps();
            await settle(() => cropSwitch(content)?.getAttribute("aria-pressed") === "true");
            // One camera move: transform and opacity only, the cover's duration, the shared ease.
            const moves = cameraMoves(record.animations);
            expect(moves).toHaveLength(1);
            const move = moves[0];
            expect(new Set(move.keyframes.flatMap((frame) => Object.keys(frame).filter((k) => k !== "offset")))).toEqual(new Set(["transform", "opacity"]));
            expect(move.options.duration).toBe(MOTION.cover);
            expect(move.options.easing).toBe(MOTION.ease);
            // The line under your eyes is still there: the same point of the same page at the middle of the screen.
            const frames = kept(m.host).cropFrames;
            const frame = before.page % 2 === 0 ? frames.right : frames.left;
            const after = pointAtMiddle(content, stage, frame);
            expect(after.page).toBe(before.page);
            expect(after.fy).toBeCloseTo(before.fy, 3);
            // It flies the sheet from where it was to where the whole sheet now is, around its frame.
            const slot = after.slot;
            const to = { left: slot.x - stage.scrollLeft - (frame.x / frame.w) * slot.w, top: slot.y - stage.scrollTop - (frame.y / frame.h) * slot.h, width: slot.w / frame.w, height: slot.h / frame.h };
            const last = String(move.keyframes[move.keyframes.length - 1].transform);
            const [tx, ty, sx, sy] = (last.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
            expect(tx).toBeCloseTo(to.left - fromBox.left, 0);
            expect(ty).toBeCloseTo(to.top - fromBox.top, 0);
            expect(sx).toBeCloseTo(to.width / fromBox.width, 2);
            expect(sy).toBeCloseTo(to.height / fromBox.height, 2);
            // In: the page is bigger than its sheet was.
            expect(sx).toBeGreaterThan(1.2);
            // Off is the same move backwards, and needs no measuring.
            const asked = calls.opLists.length;
            cropSwitch(content)!.click();
            await settle(() => cropSwitch(content)?.getAttribute("aria-pressed") === "false");
            const back = cameraMoves(record.animations);
            expect(back).toHaveLength(2);
            const [, , bx] = (String(back[1].keyframes[back[1].keyframes.length - 1].transform).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
            expect(bx).toBeLessThan(1);
            expect(calls.opLists.length).toBe(asked);
            const off = pointAtMiddle(content, stage);
            expect(Math.abs(off.fy - before.fy) * off.slot.h).toBeLessThan(1);
            // On again, from the frames already measured: no measuring, one move, the line within a pixel.
            cropSwitch(content)!.click();
            expect(cropSwitch(content)!.getAttribute("aria-busy")).toBeNull();
            await settle(() => cropSwitch(content)?.getAttribute("aria-pressed") === "true");
            expect(cameraMoves(record.animations)).toHaveLength(3);
            expect(calls.opLists.length).toBe(asked);
            const again = pointAtMiddle(content, stage, frame);
            expect(again.page).toBe(before.page);
            expect(Math.abs(again.fy - before.fy) * (again.slot.h / frame.h)).toBeLessThan(1);
        } finally {
            record.stop();
            undo();
        }
    });

    it("crops at once under reduced motion, the line still kept", async () => {
        const undo = reducedMotion(true);
        const record = recordAnimations();
        try {
            const m = await open();
            const before = pointAtMiddle(m.content, m.stage);
            await cropOn(m);
            expect(cameraMoves(record.animations)).toHaveLength(0);
            expect(m.content.byClass("reader-pv-crop-clip")).toHaveLength(0);
            const frames = kept(m.host).cropFrames;
            const after = pointAtMiddle(m.content, m.stage, before.page % 2 === 0 ? frames.right : frames.left);
            expect(after.fy).toBeCloseTo(before.fy, 3);
        } finally {
            record.stop();
            undo();
        }
    });

    it("turns back off, says so once and logs why, when the margins cannot be measured", async () => {
        const warn = jest.spyOn(log, "warn").mockImplementation(() => undefined);
        try {
            const m = await open({}, { fail: true });
            typePanel(m.content);
            const props = slots(m.content).map((slot) => JSON.stringify(slot.cssProps));
            cropSwitch(m.content)!.click();
            await settle(() => m.content.byText("The margins could not be measured.") !== undefined);
            expect(cropSwitch(m.content)!.getAttribute("aria-pressed")).toBe("false");
            expect(cropSwitch(m.content)!.getAttribute("aria-busy")).toBeNull();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(slots(m.content).map((slot) => JSON.stringify(slot.cssProps))).toEqual(props);
            expect(kept(m.host).crop).toBeUndefined();
        } finally {
            warn.mockRestore();
        }
    });
});

describe("kept per paper, and nothing written (#769 FR-6, AC-5)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("is still on when the paper is opened again, without measuring it again; the PDF and the vault are never written", async () => {
        const first = await open();
        await cropOn(first);
        expect(kept(first.host).crop).toBe(true);
        expect(kept(first.host).cropFrames).toMatchObject({ size: 10, mtime: 20 });
        // The page that could not be read is kept as shown whole, so it is not measured again either.
        expect(kept(first.host).cropFrames.whole).toEqual([9]);
        for (const write of [first.vault.modify, first.vault.modifyBinary, first.vault.create, first.vault.createBinary, first.vault.process, first.app.fileManager.processFrontMatter, first.app.fileManager.renameFile, first.store.write]) {
            expect(write).not.toHaveBeenCalled();
        }
        await first.view.onClose();
        resetReaderWorkspace();
        const again = await open(JSON.parse(JSON.stringify(first.host.settings)));
        typePanel(again.content);
        expect(cropSwitch(again.content)!.getAttribute("aria-pressed")).toBe("true");
        expect(cropSwitch(again.content)!.getAttribute("aria-busy")).toBeNull();
        await wait(40);
        await flush();
        expect(again.calls.opLists).toHaveLength(0);
        // On its frame from the first frame: Fit width fits the wider frame, not the sheet.
        const frames = kept(again.host).cropFrames;
        const scale = 768 / (Math.max(frames.right.w, frames.left.w) * PAGE_W);
        expect(box(slotOf(again.content, 0)!).w).toBe(Math.floor(frames.right.w * PAGE_W * scale));
        expect(box(slotOf(again.content, 0)!).h).toBe(Math.floor(frames.right.h * PAGE_H * scale));
    });
});

describe("everything else works on a cropped page (#769 FR-5)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("draws each page from its frame, only the frame's pixels", async () => {
        const m = await open();
        await cropOn(m);
        await settle(() => m.calls.renders.some((r: any) => r.offsetX < 0));
        const frames = kept(m.host).cropFrames;
        const drawn = m.calls.renders.filter((r: any) => r.offsetX < 0);
        expect(drawn.length).toBeGreaterThan(0);
        for (const r of drawn) {
            const frame = (r.page - 1) % 2 === 0 ? frames.right : frames.left;
            // The kept frames are rounded to a ten-thousandth of the page.
            expect(r.offsetX).toBeCloseTo(-frame.x * PAGE_W * r.scale, 0);
            expect(r.offsetY).toBeCloseTo(-frame.y * PAGE_H * r.scale, 0);
        }
    });

    it("uses the frame boxes in Scroll, Page and Spread, at one scale", async () => {
        for (const layout of ["scroll", "page", "spread"]) {
            resetReaderWorkspace();
            VIEW.width = layout === "spread" ? 1400 : 800;
            VIEW.height = layout === "spread" ? 900 : 600;
            const m = await open({ readerPrefs: { layout } });
            await cropOn(m);
            const frames = kept(m.host).cropFrames;
            const widest = Math.max(frames.right.w, frames.left.w);
            for (const el of slots(m.content)) {
                const page = Number(el.getAttribute("data-page"));
                const frame = page % 2 === 0 ? frames.right : frames.left;
                const b = box(el);
                // The slot is the frame, and the frames share one scale: the wider one fits the column.
                expect(b.h / b.w).toBeCloseTo((frame.h * PAGE_H) / (frame.w * PAGE_W), 2);
                const scale = b.w / (frame.w * PAGE_W);
                expect(scale * widest * PAGE_W).toBeLessThanOrEqual(VIEW.width);
            }
            await m.view.onClose();
        }
        VIEW.width = 800;
        VIEW.height = 600;
    });

    it("keeps a link on its words, and its jump lands where it would without crop", async () => {
        const m = await open({}, { links: true });
        await cropOn(m);
        m.stage.scrollTop = 2 * 1000;
        m.stage.fire("scroll", {});
        await wait(40);
        await settle(() => (slotOf(m.content, 2)?.byClass("reader-pv-link").length ?? 0) > 0);
        const frames = kept(m.host).cropFrames;
        const frame = frames.right;
        const link = slotOf(m.content, 2)!.byClass("reader-pv-link")[0];
        // The link's rectangle on the page, as a share of the frame shown of it.
        expect(num(link.cssProps["--zf-link-x"]) / 100).toBeCloseTo((130 / PAGE_W - frame.x) / frame.w, 3);
        expect(num(link.cssProps["--zf-link-y"]) / 100).toBeCloseTo(((PAGE_H - 712) / PAGE_H - frame.y) / frame.h, 3);
        expect(num(link.cssProps["--zf-link-w"]) / 100).toBeCloseTo(170 / PAGE_W / frame.w, 3);
        link.click();
        await settle(() => m.content.oneByClass("reader-bar-label").textContent === "Chapter 9 / 12");
        await flush();
        // XYZ 700 is 92/792 down the page; in its frame that is (share − top) / height.
        const target = box(slotOf(m.content, 8)!);
        const left = frames.right;
        const share = (PAGE_H - 700) / PAGE_H;
        expect(m.stage.scrollTop).toBeCloseTo(target.y + ((share - left.y) / left.h) * target.h, 0);
    });

    it("draws the thumbnails on the frame", async () => {
        const m = await open();
        await cropOn(m);
        const pages = m.calls.renders.length;
        const run0 = (m.view as any).pageRun;
        const canvas = new DomNode("canvas") as any;
        let done = false;
        run0.drawThumb(3, canvas, 96, () => (done = true));
        await settle(() => done);
        const thumb = m.calls.renders.slice(pages).find((r: any) => r.page === 4)!;
        const frame = kept(m.host).cropFrames.left;
        expect(thumb.offsetX).toBeCloseTo(-frame.x * PAGE_W * thumb.scale, 1);
        expect(run0.thumbRatio(3)).toBeCloseTo((frame.h * PAGE_H) / (frame.w * PAGE_W), 2);
    });

    it("turns a cropped page with its frame", async () => {
        const m = await open();
        await cropOn(m);
        const before = box(slotOf(m.content, 0)!);
        m.content.byText("Rotate page")!.parent!.click();
        await flush();
        const after = box(slotOf(m.content, 0)!);
        const frame = kept(m.host).cropFrames.right;
        // A quarter turn: the frame's height now runs across.
        expect(after.w / after.h).toBeCloseTo((frame.h * PAGE_H) / (frame.w * PAGE_W), 1);
        expect(after.w / after.h).toBeGreaterThan(before.w / before.h);
    });
});

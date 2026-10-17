/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterEach, beforeEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode } from "../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../support/motionDom";
import { fakeFrames } from "../../support/fakeFrames";
import { clearFrameTraces, frameTraces, setFrameMeter } from "architecture/monitoring/frameMeter";
import { ReaderPager } from "architecture/components/core/reader/readerPager";
import { endChapterTurn, playChapterTurn } from "architecture/components/core/reader/readerTurn";
import { beginOpenShot } from "architecture/components/core/reader/readerShot";

const SRC = join(__dirname, "..", "..", "..", "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

/** A stage and a ten-page strip, on a window the test shows frames on. */
function strip(win: any) {
    const stage = new DomNode("div") as any;
    stage.win = win;
    const page = stage.createEl("article", { cls: "zettelkasten-flow__reader-page" }) as any;
    page.win = win;
    page.createDiv({ cls: "zettelkasten-flow__reader-body" }).createEl("p", { text: "A page." });
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
    const prop = (name: string) => parseFloat(page.cssProps[name] ?? "0") || 0;
    Object.defineProperty(page, "scrollWidth", { configurable: true, get: () => prop("--zf-page-col") + (prop("--zf-page-col") + prop("--zf-page-gap")) * 9 });
    page.getBoundingClientRect = () => ({ left: prop("--zf-page-gap") + prop("--zf-strip-x"), top: 0, width: prop("--zf-page-w"), height: 800 });
    const pager = new ReaderPager(stage, page);
    pager.configure("page", "ltr");
    pager.relayout("start");
    return { stage, page, pager };
}

/** The four gestures carry the meter (#826 FR-1) — and leave nothing behind it when it is off. */
describe("the gestures, metered (#826)", () => {
    let rec: AnimationRecord;
    let motion: () => void;
    beforeEach(() => {
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        endChapterTurn();
        rec.stop();
        motion();
        setFrameMeter(false);
        clearFrameTraces();
    });

    it("times a page drag to its spring, keyed by how it ended", async () => {
        const f = fakeFrames();
        setFrameMeter(true);
        const { pager } = strip(f.win);
        pager.goTo(4);
        pager.drag(-20);
        f.frames(6);
        pager.drag(-40);
        f.frames(6);
        pager.release(0);
        // The spring lands: its animation finishes, and the motion with it.
        for (const animation of rec.animations) animation.finish();
        await Promise.resolve();
        await Promise.resolve();
        f.frames(4);
        expect([...frameTraces().keys()]).toEqual(["page-drag:spring"]);
        expect(frameTraces().get("page-drag:spring")![0].trace.frames.length).toBeGreaterThanOrEqual(10);
    });

    it("times a chapter turn the clock plays, under its motion's name", () => {
        const f = fakeFrames();
        setFrameMeter(true);
        const root = new DomNode() as any;
        root.win = Object.assign(f.win, { matchMedia: () => ({ matches: false }), setTimeout: () => 0 });
        const stage = root.createDiv({ cls: "zettelkasten-flow__reader-stage" });
        const page = stage.createEl("article", { cls: "zettelkasten-flow__reader-page" });
        page.createEl("p", { text: "The page you were on." });
        expect(playChapterTurn(root, stage as never, page as never, "leaf", 1)).toBe(true);
        f.frames(10);
        endChapterTurn();
        f.frames(4);
        expect([...frameTraces().keys()]).toEqual(["chapter-turn:leaf:clock"]);
    });

    it("ends the opening shot at a key, within a frame, and says it was stopped (AC-8)", () => {
        const f = fakeFrames();
        setFrameMeter(true);
        const win = Object.assign(f.win, { matchMedia: () => ({ matches: false }) });
        const view = new DomNode("div") as any;
        view.win = win;
        view.getBoundingClientRect = () => ({ left: 0, top: 40, width: 1400, height: 820 });
        const cover = view.createDiv() as any;
        cover.win = win;
        cover.doc = { body: new DomNode("body") };
        cover.getBoundingClientRect = () => ({ left: 300, top: 260, width: 120, height: 180 });
        expect(beginOpenShot(view, cover)).toBe(true);
        f.frames(5);
        f.input("keydown");
        expect(rec.animations.every((animation) => animation.playState === "finished")).toBe(true);
        // The camera is at its end with the next frame shown.
        f.frames(1);
        // The next shot lets the first one go, as a second click does.
        beginOpenShot(view, cover);
        f.frames(4);
        const [kept] = frameTraces().get("open-shot:interrupted") ?? [];
        expect(kept.trace.interrupt).toBeDefined();
        expect(kept.verdict.interruptFrames).toBeLessThanOrEqual(1);
    });

    it("stores nothing, and asks the window nothing, when the meter is off", () => {
        const f = fakeFrames();
        const { pager } = strip(f.win);
        pager.goTo(4);
        const asked = f.win.requestAnimationFrame.mock.calls.length;
        pager.drag(-60);
        pager.release(0);
        expect(frameTraces().size).toBe(0);
        expect(f.win.requestAnimationFrame.mock.calls.length).toBe(asked);
    });

    it("reaches the meter only through meterGesture, in every gesture's own file", () => {
        for (const path of ["architecture/components/core/reader/readerPager.ts", "architecture/components/core/reader/readerTurn.ts", "architecture/components/core/reader/readerShot.ts", "architecture/components/core/library/libraryDrag.ts"]) {
            const source = read(path);
            expect({ path, meters: source.includes("meterGesture(") }).toEqual({ path, meters: true });
            expect({ path, other: /setFrameMeter|frameTraces|clearFrameTraces/.test(source) }).toEqual({ path, other: false });
        }
        // The shot and the shelf: interrupted by the skip, ended with the motion.
        expect(read("architecture/components/core/reader/readerShot.ts").match(/meter\.interrupted\(\)/g)).toHaveLength(2);
        expect(read("architecture/components/core/library/libraryDrag.ts")).toContain("meter?.moved()");
    });
});

describe("a drag something else ends (#826 review)", () => {
    afterEach(() => {
        setFrameMeter(false);
        clearFrameTraces();
    });

    it("ends the drag's frames when a turn takes over, and leaves no loop running", () => {
        setFrameMeter(true);
        const f = fakeFrames();
        const { pager } = strip(f.win);
        pager.goTo(4);
        pager.drag(-30);
        f.frames(5);
        pager.turn(1);
        f.frames(6);
        const asked = f.win.requestAnimationFrame.mock.calls.length;
        f.frames(5);
        expect(f.win.requestAnimationFrame.mock.calls.length).toBe(asked);
    });
});

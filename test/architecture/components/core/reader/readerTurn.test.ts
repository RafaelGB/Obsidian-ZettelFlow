import { describe, it, expect, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { recordAnimations, type AnimationRecord } from "../../../../support/motionDom";
import { adoptChapterScrub, beginChapterScrub, endChapterTurn, playChapterTurn } from "architecture/components/core/reader/readerTurn";
import { MOTION } from "architecture/components/core/reader/readerMotion";

const VIEW = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "reader", "ReaderView.ts"), "utf8");

/** A chapter changes physically (#735, epic #729): a sheet, never a dissolve — and never in the way. */
describe("a chapter changes physically (#735)", () => {
    it("plays nothing where motion is not welcome: the next chapter simply is there", () => {
        const still = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 800 }) } as unknown as HTMLElement;
        for (const motion of ["leaf", "flow", "stack"] as const) expect(playChapterTurn(still, still, still, motion, 1)).toBe(false);
        expect(() => endChapterTurn()).not.toThrow();
    });

    it("lays the sheet before the page is emptied, in both kinds of chapter", () => {
        // The sheet is a picture of the page you were on: taken after `empty()` it would be blank.
        const turns = [...VIEW.matchAll(/this\.turnFrom\(page\);\s*\n\s*page\.empty\(\);/g)];
        expect(turns).toHaveLength(2);
    });

    it("reads the chosen motion from Settings → Reading", () => {
        expect(VIEW).toContain("readingMotion(this.plugin?.settings?.readingMotion).chapter");
    });
});

/** A reader's three parts as the turn finds them: the root, the stage, the page with something on it. */
function reader(reduced = false) {
    const root = new DomNode();
    const stage = root.createDiv({ cls: "zettelkasten-flow__reader-stage" });
    const page = stage.createEl("article", { cls: "zettelkasten-flow__reader-page" });
    page.createEl("p", { text: "The page you were on." });
    const canvas = page.createDiv().createEl("canvas") as DomNode & { width: number; height: number; getContext?: unknown };
    canvas.width = 800;
    canvas.height = 1000;
    const listeners: Record<string, unknown[]> = {};
    (root as unknown as { win: unknown }).win = {
        matchMedia: () => ({ matches: reduced }),
        setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
        addEventListener: (name: string, fn: unknown) => (listeners[name] ??= []).push(fn),
        removeEventListener: (name: string, fn: unknown) => (listeners[name] = (listeners[name] ?? []).filter((f) => f !== fn)),
    };
    return { root, stage, page, listeners };
}

const sheetOf = (root: DomNode) => root.byClass("turn-sheet")[0];

/** Turning by finger (#750 D4, FR-17, FR-18, FR-22): the same turn, driven by a finger instead of a clock. */
describe("a chapter turned by the finger (#750)", () => {
    let rec: AnimationRecord;
    afterEach(() => {
        endChapterTurn();
        rec?.stop();
    });

    it("builds exactly the turn the clock plays, held still at its start, for leaf, flow and stack", () => {
        rec = recordAnimations();
        for (const motion of ["leaf", "flow", "stack"] as const) {
            const played = reader();
            expect(playChapterTurn(played.root as never, played.stage as never, played.page as never, motion, 1)).toBe(true);
            const clock = rec.animations.splice(0).map((a) => ({ keyframes: a.keyframes, duration: a.duration }));
            endChapterTurn();
            const held = reader();
            const scrub = beginChapterScrub(held.root as never, held.stage as never, held.page as never, motion, 1, "p. 2");
            expect(scrub).not.toBeNull();
            expect(rec.animations.map((a) => ({ keyframes: a.keyframes, duration: a.duration }))).toEqual(clock);
            expect(rec.animations.every((a) => a.playState === "paused" && a.currentTime === 0)).toBe(true);
            scrub!.cancel();
            rec.animations.splice(0);
        }
    });

    it("moves the sheet with the finger, and nothing but transform and opacity", () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        const scrub = beginChapterScrub(root as never, stage as never, page as never, "stack", 1, "p. 2")!;
        scrub.scrub(0.4);
        expect(rec.animations.every((a) => a.currentTime === 0.4 * MOTION.turn)).toBe(true);
        scrub.scrub(1.7);
        expect(rec.animations.every((a) => a.currentTime === MOTION.turn)).toBe(true);
        for (const key of rec.keys()) expect(["transform", "opacity", "offset", "easing"]).toContain(key);
    });

    it("hides the live page under the sheet and shows the paper and the next chapter's name — nothing is drawn yet", () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        beginChapterScrub(root as never, stage as never, page as never, "leaf", 1, "p. 2");
        expect(page.hasClass("zettelkasten-flow__reader-page--under-scrub")).toBe(true);
        expect(root.oneByClass("turn-underlay").textContent).toBe("p. 2");
        // The page itself is untouched: what was on it is still there, under the sheet.
        expect(page.findAll((el) => el.tag === "p")[0].textContent).toBe("The page you were on.");
    });

    it("completes at the speed it was let go, and the chapter that follows adopts it", () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        const scrub = beginChapterScrub(root as never, stage as never, page as never, "leaf", 1, "p. 2")!;
        scrub.scrub(0.5);
        scrub.release("complete", 2);
        expect(rec.animations.every((a) => a.playbackRate === 2 && a.playState === "running")).toBe(true);
        // The view shows the next chapter: its turn is this one, not a second sheet.
        expect(adoptChapterScrub()).toBe(true);
        expect(root.byClass("turn-sheet")).toHaveLength(1);
        expect(page.hasClass("zettelkasten-flow__reader-page--under-scrub")).toBe(false);
        expect(root.byClass("turn-underlay")).toHaveLength(0);
        // Adopted once: a later chapter change is a turn of its own.
        expect(adoptChapterScrub()).toBe(false);
    });

    it("springs back the way it came, then the page is exactly as it was", async () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        const scrub = beginChapterScrub(root as never, stage as never, page as never, "flow", 1, "p. 2")!;
        scrub.scrub(0.3);
        scrub.release("spring");
        const sheetAnimation = rec.animations.find((a) => a.target === sheetOf(root))!;
        expect(sheetAnimation.playbackRate).toBeLessThan(0);
        expect(sheetAnimation.playState).toBe("running");
        // It takes the shared beat to get back: 0.3 of the turn, at the rate that makes it 250 ms.
        expect((0.3 * MOTION.turnFlow) / Math.abs(sheetAnimation.playbackRate)).toBeCloseTo(MOTION.base, 5);
        expect(adoptChapterScrub()).toBe(false);
        rec.finishAll();
        await flush();
        expect(root.byClass("turn-sheet")).toHaveLength(0);
        expect(root.byClass("turn-underlay")).toHaveLength(0);
        expect(page.hasClass("zettelkasten-flow__reader-page--under-scrub")).toBe(false);
    });

    it("lets the copied pictures go with the sheet: WebKit counts every canvas", async () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        const scrub = beginChapterScrub(root as never, stage as never, page as never, "stack", 1, "p. 2")!;
        const copied = sheetOf(root).findAll((el) => el.tag === "canvas") as (DomNode & { width: number; height: number })[];
        expect(copied.map((cv) => [cv.width, cv.height])).toEqual([[800, 1000]]);
        scrub.cancel();
        expect(copied.map((cv) => [cv.width, cv.height])).toEqual([[0, 0]]);
    });

    it("still follows the finger under reduced motion — and completes at once on release", () => {
        rec = recordAnimations();
        const { root, stage, page } = reader(true);
        // The clock's turn does not play under reduced motion…
        expect(playChapterTurn(root as never, stage as never, page as never, "leaf", 1)).toBe(false);
        // …but a finger is not an animation: the sheet is under it.
        const scrub = beginChapterScrub(root as never, stage as never, page as never, "leaf", 1, "p. 2")!;
        scrub.scrub(0.25);
        expect(rec.animations.every((a) => a.currentTime === 0.25 * MOTION.turn)).toBe(true);
        scrub.release("complete", 1);
        expect(rec.animations.every((a) => a.playState === "finished")).toBe(true);
    });
});

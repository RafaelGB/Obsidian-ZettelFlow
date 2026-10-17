import { describe, it, expect, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { recordAnimations, type AnimationRecord } from "../../../../support/motionDom";
import { adoptChapterScrub, beginChapterScrub, endChapterTurn, isFolded, playChapterTurn, playFold, unfoldAtOnce } from "architecture/components/core/reader/readerTurn";
import { MOTION, copyLive } from "architecture/components/core/reader/readerMotion";
import { clearSamples, lastSample, sampleCount } from "architecture/monitoring/measure";

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

/** In pages (#753) every paragraph shares the view's top: the sheet must still hold only what shows. */
describe("a turning sheet in pages (#753 T9)", () => {
    let rec: AnimationRecord;
    afterEach(() => {
        endChapterTurn();
        rec?.stop();
    });

    function paged() {
        const { root, stage, page } = reader();
        page.empty();
        const at = (el: DomNode, box: { left: number; top: number; width: number; height: number }) => {
            (el as unknown as { getBoundingClientRect: () => typeof box }).getBoundingClientRect = () => box;
            return el;
        };
        at(stage, { left: 0, top: 0, width: 1000, height: 800 });
        at(page, { left: 200, top: 0, width: 600, height: 800 });
        const here = at(page.createEl("p", { text: "On this page." }), { left: 200, top: 40, width: 600, height: 60 });
        at(page.createEl("p", { text: "On the next page." }), { left: 1200, top: 40, width: 600, height: 60 });
        // A paragraph a page break cut: its first piece at the foot of this page, the rest on the next.
        const cut = at(page.createEl("p", { text: "Cut across the break." }), { left: 200, top: 700, width: 1600, height: 800 });
        (cut as unknown as { getClientRects: () => unknown[] }).getClientRects = () => [
            { left: 200, top: 700, width: 600, height: 100 },
            { left: 1200, top: 0, width: 600, height: 60 },
        ];
        return { root, stage, page, here };
    }

    it("copies a child on screen and skips one to the right of the view", () => {
        rec = recordAnimations();
        const { root, stage, page } = paged();
        expect(playChapterTurn(root as never, stage as never, page as never, "stack", 1)).toBe(true);
        const texts = sheetOf(root).findAll((el) => el.tag === "p").map((p) => p.textContent);
        expect(texts).toContain("On this page.");
        expect(texts).not.toContain("On the next page.");
    });

    it("copies a block a page break cut once per piece on screen, clipped to that piece", () => {
        rec = recordAnimations();
        const { root, stage, page } = paged();
        playChapterTurn(root as never, stage as never, page as never, "stack", 1);
        const pieces = sheetOf(root).byClass("turn-piece");
        expect(pieces).toHaveLength(1);
        expect(pieces[0].cssProps["--zf-turn-h"]).toBe("100px");
        const copy = pieces[0].children[0];
        expect(copy.textContent).toBe("Cut across the break.");
        expect(copy.cssProps["--zf-turn-y"]).toBe("0px");
    });

    it("carries a drawing and an equation into the sheet, in their namespaces (#770)", () => {
        rec = recordAnimations();
        const { root, stage, page } = paged();
        const box = (el: DomNode, top: number) => {
            (el as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => ({ left: 200, top, width: 600, height: 40 });
            return el;
        };
        box(page.createSvg("svg", { attr: { "data-zf-drawing": "true" } }), 120).createSvg("circle");
        // MathML: Obsidian gives HTML and SVG elements setCssProps, never an equation.
        const math = box(new DomNode("math"), 180);
        math.namespaceURI = "http://www.w3.org/1998/Math/MathML";
        (math as unknown as { setCssProps?: unknown }).setCssProps = undefined;
        page.appendChild(math);
        expect(() => playChapterTurn(root as never, stage as never, page as never, "stack", 1)).not.toThrow();
        const sheet = sheetOf(root);
        expect(sheet.find((el) => el.tag === "svg")?.namespaceURI).toBe("http://www.w3.org/2000/svg");
        const copied = sheet.find((el) => el.tag === "math");
        expect(copied?.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
        // Placed by a holder, since the equation itself cannot be.
        expect(copied?.parent?.cssProps["--zf-turn-y"]).toBe("180px");
    });
    it("carries a designed page into the sheet with its shadow content, adopting the same sheet (#771)", () => {
        rec = recordAnimations();
        const { root, stage, page } = paged();
        const host = page.createDiv({ cls: "zettelkasten-flow__reader-designed-host" });
        (host as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => ({ left: 200, top: 100, width: 600, height: 400 });
        const shadow = host.attachShadow({ mode: "open" }) as DomNode & { adoptedStyleSheets: unknown[] };
        const sheet = { the: "page's own sheet" };
        shadow.adoptedStyleSheets = [sheet];
        shadow.createDiv({ attr: { "data-zf-html": "" } }).createDiv({ text: "Panel 1" });
        playChapterTurn(root as never, stage as never, page as never, "stack", 1);
        const copied = sheetOf(root).byClass("reader-designed-host")[0];
        // cloneNode copies a host empty, as the platform does: the copy has a root of its own.
        expect(copied.shadowRoot).not.toBeNull();
        expect(copied.shadowRoot).not.toBe(host.shadowRoot);
        expect(copied.shadowRoot?.adoptedStyleSheets[0]).toBe(sheet);
        expect(copied.shadowRoot?.textContent).toBe("Panel 1");
    });
});

describe("what cloneNode leaves behind, copied (#771)", () => {
    afterEach(() => rec?.stop());
    let rec: AnimationRecord | undefined;

    it("draws a canvas into its copy, and gives a host its page again — the shared copy of the turn and the shot", () => {
        rec = recordAnimations();
        const from = new DomNode();
        const canvas = from.createEl("canvas") as DomNode & { width: number; height: number; getContext: () => unknown };
        canvas.width = 30;
        canvas.height = 40;
        const drawn: unknown[] = [];
        const host = from.createDiv({ cls: "zettelkasten-flow__reader-designed-host" });
        host.attachShadow({ mode: "open" }).createDiv({ text: "Bread" });
        const to = (from as unknown as { cloneNode: (deep: boolean) => DomNode }).cloneNode(true);
        const copyCanvas = to.find((el) => el.tag === "canvas") as DomNode & { width: number; getContext: () => unknown };
        copyCanvas.getContext = () => ({ drawImage: (source: unknown) => drawn.push(source) });
        expect(to.byClass("reader-designed-host")[0].shadowRoot).toBeNull();
        copyLive(from as never, to as never);
        expect(copyCanvas.width).toBe(30);
        expect(drawn).toEqual([canvas]);
        expect(to.byClass("reader-designed-host")[0].shadowRoot?.textContent).toBe("Bread");
    });

    it("is what the turn and the shot both use: one copy, not two", () => {
        const source = (file: string) => readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "reader", file), "utf8");
        for (const file of ["readerTurn.ts", "readerShot.ts"]) {
            expect(source(file)).toContain("copyLive(");
            expect(source(file)).not.toContain("copyCanvases");
        }
    });
});

/** Recall's fold (#760 FR-10, FR-11, FR-13): the turn's own sheet, down out of the column and back. */
describe("recall folds the page away, and back (#760)", () => {
    let rec: AnimationRecord;
    afterEach(() => {
        endChapterTurn();
        rec?.stop();
    });
    const FOLDED = "zettelkasten-flow__reader-page--folded";

    it("away: lays the page on a sheet, folds the live page and slides the sheet down over `cover`, leaving the title", async () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        const done = playFold(root as never, stage as never, page as never, "away", "3 · The lazy controller");
        expect(page.hasClass(FOLDED)).toBe(true);
        const sheet = sheetOf(root);
        expect(sheet.findAll((el) => el.tag === "p").map((p) => p.textContent)).toEqual(["The page you were on."]);
        const slide = rec.animations.find((a) => a.target === sheet)!;
        expect(slide.duration).toBe(MOTION.cover);
        expect(slide.keyframes[0]).toEqual({ transform: "translateY(0px)" });
        expect(String(slide.keyframes[1].transform)).toMatch(/^translateY\(\d/);
        // The paper under the sheet, with the chapter's title on it.
        const underlay = root.oneByClass("turn-fold");
        expect(underlay.textContent).toBe("3 · The lazy controller");
        expect(root.children.indexOf(underlay)).toBeLessThan(root.children.indexOf(sheet));
        for (const key of rec.keys()) expect(["transform", "opacity", "offset", "easing"]).toContain(key);
        rec.finishAll();
        await done;
        expect(root.byClass("turn-sheet")).toHaveLength(0);
        expect(isFolded(page as never)).toBe(true);
        // The page itself is untouched under the fold.
        expect(page.findAll((el) => el.tag === "p")[0].textContent).toBe("The page you were on.");
    });

    it("back: a sheet of the folded page slides up over the paper, then the page is unfolded under it", async () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        rec.animations.length = 0;
        const away = playFold(root as never, stage as never, page as never, "away", "Prelude");
        rec.finishAll();
        await away;
        rec.animations.length = 0;
        const back = playFold(root as never, stage as never, page as never, "back", "Prelude");
        const sheet = sheetOf(root);
        // Drawn as the page is, not as the fold hides it, and above the paper.
        expect(sheet.findAll((el) => el.hasClass(FOLDED))).toEqual([]);
        expect(root.children.indexOf(sheet)).toBeGreaterThan(root.children.indexOf(root.oneByClass("turn-fold")));
        const slide = rec.animations.find((a) => a.target === sheet)!;
        expect(slide.duration).toBe(MOTION.cover);
        expect(slide.keyframes[1]).toEqual({ transform: "translateY(0px)" });
        // Still folded while it rises.
        expect(page.hasClass(FOLDED)).toBe(true);
        rec.finishAll();
        await back;
        expect(page.hasClass(FOLDED)).toBe(false);
        expect(root.byClass("turn-fold")).toHaveLength(0);
        expect(root.byClass("turn-sheet")).toHaveLength(0);
    });

    it("completes either move at once on any key or press", async () => {
        rec = recordAnimations();
        const { root, stage, page, listeners } = reader();
        const done = playFold(root as never, stage as never, page as never, "away", "Prelude");
        expect(listeners.keydown).toHaveLength(1);
        (listeners.keydown[0] as () => void)();
        await done;
        expect(root.byClass("turn-sheet")).toHaveLength(0);
        expect(page.hasClass(FOLDED)).toBe(true);
        expect(listeners.keydown).toHaveLength(0);
        const back = playFold(root as never, stage as never, page as never, "back", "Prelude");
        (listeners.pointerdown[0] as () => void)();
        await back;
        expect(page.hasClass(FOLDED)).toBe(false);
    });

    it("under reduced motion the page simply goes, and is simply back: no animation", async () => {
        rec = recordAnimations();
        const { root, stage, page } = reader(true);
        await playFold(root as never, stage as never, page as never, "away", "Prelude");
        expect(page.hasClass(FOLDED)).toBe(true);
        expect(root.oneByClass("turn-fold").textContent).toBe("Prelude");
        await playFold(root as never, stage as never, page as never, "back", "Prelude");
        expect(page.hasClass(FOLDED)).toBe(false);
        expect(root.byClass("turn-fold")).toHaveLength(0);
        expect(rec.animations).toEqual([]);
    });

    it("does nothing twice: away when away, back when back; and unfolds at once when asked", async () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        await playFold(root as never, stage as never, page as never, "back", "Prelude");
        expect(rec.animations).toEqual([]);
        const away = playFold(root as never, stage as never, page as never, "away", "Prelude");
        rec.finishAll();
        await away;
        rec.animations.length = 0;
        await playFold(root as never, stage as never, page as never, "away", "Prelude");
        expect(rec.animations).toEqual([]);
        unfoldAtOnce(root as never, page as never);
        expect(page.hasClass(FOLDED)).toBe(false);
        expect(root.byClass("turn-fold")).toHaveLength(0);
    });
});

/** The start of a chapter turn is timed, and it copies the page on screen — never the chapter (#825 B4). */
describe("the start of a chapter turn (#825)", () => {
    let rec: AnimationRecord;
    afterEach(() => {
        endChapterTurn();
        rec?.stop();
    });

    it("times the sheet, played by the clock or held by a finger", () => {
        rec = recordAnimations();
        clearSamples();
        const played = reader();
        playChapterTurn(played.root as never, played.stage as never, played.page as never, "stack", 1);
        endChapterTurn();
        const held = reader();
        beginChapterScrub(held.root as never, held.stage as never, held.page as never, "leaf", 1, "p. 2")?.cancel();
        expect(sampleCount("reader.chapter.turn.start")).toBe(2);
        expect(lastSample("reader.chapter.turn.start")?.scale).toBeUndefined();
    });

    it("copies the ten blocks on screen of a four-hundred-block page, and no others", () => {
        rec = recordAnimations();
        const { root, stage, page } = reader();
        page.empty();
        const box = (left: number, top: number, width: number, height: number) => () => ({ left, top, width, height });
        (stage as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = box(0, 0, 600, 800);
        (page as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = box(0, 0, 600, 800);
        for (let i = 0; i < 400; i++) {
            const block = page.createEl("p", { text: `Block ${i}` }) as unknown as { getBoundingClientRect: unknown };
            block.getBoundingClientRect = box(0, (i - 10) * 80 + 5, 600, 70);
        }
        expect(playChapterTurn(root as never, stage as never, page as never, "stack", 1)).toBe(true);
        const copied = sheetOf(root).findAll((el) => el.tag === "p").map((el) => el.textContent);
        expect(copied).toEqual(Array.from({ length: 10 }, (_, i) => `Block ${i + 10}`));
    });
});

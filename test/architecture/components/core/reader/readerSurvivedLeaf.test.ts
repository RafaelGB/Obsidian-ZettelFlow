/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { renderSurvivedLeaf, SURVIVED_STAGGERED, SURVIVED_STEP_MS, type SurvivedCard } from "architecture/components/core/reader/readerSurvivedLeaf";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { bufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import type { Thought } from "application/thinking/thought";
import en from "architecture/lang/locale/en";

const BOOK = "Books/Middlemarch.epub";
const cls = (name: string) => `zettelkasten-flow__${name}`;

const scopes: Component[] = [];
let rec: AnimationRecord | null = null;
let undoMotion: (() => void) | null = null;
afterEach(() => {
    for (const scope of scopes.splice(0)) scope.unload();
    rec?.stop();
    rec = null;
    undoMotion?.();
    undoMotion = null;
});

function thought(id: string, over: Partial<Thought> = {}): Thought {
    return {
        id,
        at: 1,
        text: "",
        links: [],
        about: BOOK,
        quote: { exact: `the passage called ${id}`, prefix: "", suffix: "" },
        locator: { at: 1, label: "Prelude" },
        ...over,
    } as Thought;
}

const MARKS = [
    thought("alpha", { meaning: "idea", text: "Why she married him" }),
    thought("beta", { meaning: "question" }),
    thought("gamma", { quote: undefined, text: "A note in the margin of the page" }),
];
const INK = [thought("delta", { ink: { drawing: "Lab/ink/delta.svg", side: "right", x: 0, line: 1, em: 1 } as never, quote: { exact: "inked words", prefix: "", suffix: "" } })];

function draw(over: Partial<SurvivedCard> = {}) {
    const page = new DomNode();
    const scope = new Component();
    scope.load();
    scopes.push(scope);
    const actions = {
        write: jest.fn(),
        keepReading: jest.fn(),
        dontPause: jest.fn(),
        open: jest.fn(),
        touched: jest.fn(),
    };
    const card: SurvivedCard = {
        kicker: "End of chapter 4",
        title: "Old and young",
        marks: MARKS,
        ink: INK,
        touched: [{ path: "Ideas/Dorothea's choice.md", title: "Dorothea's choice" }],
        drawingOf: async () => undefined,
        motion: true,
        actions,
        ...over,
    };
    const leaf = renderSurvivedLeaf(page as never, card, scope);
    return { page, leaf, actions };
}

const texts = (page: DomNode, name: string) => page.byClass(name).map((el) => el.textContent);

describe("the leaf: what survived (#755 AC-4)", () => {
    it("is a page: the kicker, the heading, the chapter's title, your marks, your ink, what it touched, the question", () => {
        const { page } = draw();
        expect(page.byClass("reader-survived")).toHaveLength(1);
        expect(texts(page, "reader-count")).toEqual(["End of chapter 4"]);
        expect(texts(page, "reader-chapter-title")).toEqual(["What survived?"]);
        expect(texts(page, "reader-survived-chapter")).toEqual(["Old and young"]);
        expect(texts(page, "reader-hl-heading")).toEqual(["Your marks in this chapter", "Your ink", "It touched"]);
        const marks = page.byClass("reader-survived-mark");
        expect(marks.map((row) => row.getAttribute("data-hl"))).toEqual(["alpha", "beta", "gamma"]);
        expect(marks[0].hasClass(cls("reader-hl-item--idea"))).toBe(true);
        expect(marks[1].hasClass(cls("reader-hl-item--question"))).toBe(true);
        expect(texts(page, "reader-hl-note")).toEqual(["Why she married him", "A note in the margin of the page"]);
        expect(page.byClass("reader-survived-ink").map((row) => row.getAttribute("data-ink"))).toEqual(["delta"]);
        expect(texts(page, "reader-survived-note")).toEqual(["Dorothea's choice"]);
        expect(texts(page, "reader-survived-question")).toEqual(["Is one of these worth a note of its own?"]);
        expect(texts(page, "reader-survived-no-summary")).toEqual(["No summary is written for you."]);
    });

    it("holds no digit beyond the kicker's, and no text not drawn from the locale or your marks and notes", () => {
        const { page } = draw();
        const kicker = page.oneByClass("reader-count");
        const words = new Set<string>([
            ...Object.values(en as Record<string, string>),
            ...MARKS.flatMap((m) => [m.quote?.exact ?? "", m.text]),
            "Old and young",
            "Dorothea's choice",
            "→",
            "",
        ]);
        const leaves = collectLeaves(page, kicker);
        for (const text of leaves) {
            expect(text).not.toMatch(/\d/);
            expect(words.has(text)).toBe(true);
        }
    });

    it("has one primary action, Keep reading", () => {
        const { page, actions } = draw();
        const cta = page.find((el) => el.hasClass("mod-cta"));
        expect(page.findAll((el) => el.hasClass("mod-cta"))).toHaveLength(1);
        expect(cta?.textContent).toContain("Keep reading");
        cta!.click();
        expect(actions.keepReading).toHaveBeenCalledTimes(1);
        expect(actions.touched).not.toHaveBeenCalled();
    });

    it("lists only what there is: no section for nothing", () => {
        const { page } = draw({ ink: [], touched: [], title: undefined });
        expect(texts(page, "reader-hl-heading")).toEqual(["Your marks in this chapter"]);
        expect(page.byClass("reader-survived-chapter")).toHaveLength(0);
    });

    it("Don't pause at chapter ends turns the switch off, and is a touch", () => {
        const { page, actions } = draw();
        page.oneByClass("reader-survived-quiet").click();
        expect(actions.dontPause).toHaveBeenCalledTimes(1);
        expect(actions.touched).toHaveBeenCalled();
    });

    it("opens a note it touched where you are", () => {
        const { page, actions } = draw();
        const link = page.oneByClass("reader-survived-note");
        link.click();
        expect(actions.open).toHaveBeenCalledWith(page.oneByClass("reader-survived-touched"), "Ideas/Dorothea's choice.md", "Dorothea's choice");
    });
});

/** Every leaf element's text, but the kicker. */
function collectLeaves(root: DomNode, skip: DomNode): string[] {
    const out: string[] = [];
    const walk = (node: DomNode) => {
        if (node === skip) return;
        if (node.children.length === 0) out.push(node.textContent);
        for (const child of node.children) walk(child);
    };
    walk(root);
    return out;
}

describe("the leaf writes nothing; Write a note asks the preview (#755 AC-5)", () => {
    it("choosing a mark offers Write a note, which asks the preview for that mark and its row", () => {
        const before = bufferedWrites().length;
        const { page, actions } = draw();
        expect(page.byClass("reader-survived-write")).toHaveLength(0);
        const row = page.byClass("reader-survived-mark")[0];
        (row as any).getBoundingClientRect = () => ({ left: 10, top: 200, width: 600, height: 80 });
        row.oneByClass("reader-survived-pick").click();
        expect(row.hasClass("is-active")).toBe(true);
        expect(actions.touched).toHaveBeenCalled();
        row.oneByClass("reader-survived-write").click();
        expect(actions.write).toHaveBeenCalledWith(MARKS[0], { left: 10, top: 200, width: 600, height: 80 });
        // Choosing another puts the first back.
        page.byClass("reader-survived-mark")[1].oneByClass("reader-survived-pick").click();
        expect(row.hasClass("is-active")).toBe(false);
        expect(page.byClass("reader-survived-write")).toHaveLength(1);
        expect(bufferedWrites().length).toBe(before);
    });
});

describe("the leaf settles in (#755 FR-12, FR-13, FR-15)", () => {
    it("ornament, heading, the rows 40 ms apart, the question last: a fade and a 4 px rise, base", () => {
        rec = recordAnimations();
        const { page } = draw();
        const settle = rec.animations.filter((a) => a.keyframes[0].transform === "translateY(4px)");
        const targets = settle.map((a) => a.target as DomNode);
        expect(targets[0].hasClass(cls("reader-ornament"))).toBe(true);
        expect(targets[1].hasClass(cls("reader-survived-head"))).toBe(true);
        expect(targets.slice(2, 5).map((el) => el.getAttribute("data-hl"))).toEqual(["alpha", "beta", "gamma"]);
        expect(targets[5].getAttribute("data-ink")).toBe("delta");
        expect(targets[6].hasClass(cls("reader-survived-note"))).toBe(true);
        expect(targets[7]).toBe(page.oneByClass("reader-survived-question"));
        expect(settle.map((a) => (a.options as any).delay)).toEqual([0, 40, 80, 120, 160, 200, 240, 280, 280]);
        for (const a of settle) {
            expect(a.options.duration).toBe(MOTION.base);
            expect(a.keyframes[0].opacity).toBe(0);
            expect(a.keyframes[1]).toEqual({ opacity: 1, transform: "translateY(0px)" });
        }
        expect(SURVIVED_STEP_MS).toBe(40);
    });

    it("settles once the turn has landed: every delay starts after it", () => {
        rec = recordAnimations();
        draw({ settleAfter: 650 });
        const settle = rec.animations.filter((a) => a.keyframes[0].transform === "translateY(4px)");
        expect(settle.map((a) => (a.options as any).delay)).toEqual([650, 690, 730, 770, 810, 850, 890, 930, 930]);
    });

    it("staggers at most eight rows; the rest are simply there", () => {
        rec = recordAnimations();
        const many = Array.from({ length: 12 }, (_, i) => thought(`m${String.fromCharCode(97 + i)}`, { meaning: "quote" }));
        draw({ marks: many, ink: [], touched: [] });
        const rows = rec.animations.filter((a) => (a.target as DomNode).hasClass(cls("reader-survived-mark")));
        expect(rows).toHaveLength(SURVIVED_STAGGERED);
    });

    it("a pointer on the leaf completes the settle at once", () => {
        rec = recordAnimations();
        const { leaf } = draw();
        expect(rec.animations.every((a) => a.playState === "running")).toBe(true);
        (leaf.root as unknown as DomNode).fire("pointerdown");
        expect(rec.animations.every((a) => a.playState === "finished")).toBe(true);
    });

    it("a chosen mark lifts a little, fast, and its ink is drawn", () => {
        rec = recordAnimations();
        const { page } = draw();
        const row = page.byClass("reader-survived-mark")[0];
        row.oneByClass("reader-survived-pick").click();
        const lift = rec.animations.find((a) => a.target === row && a.keyframes[1]?.transform === "scale(1.02)");
        expect(lift?.options.duration).toBe(MOTION.fast);
        expect(rec.animations.some((a) => (a.target as DomNode).hasClass(cls("reader-survived-ink-bar")))).toBe(true);
        expect([...rec.keys()].every((key) => key === "opacity" || key === "transform")).toBe(true);
    });

    it("under reduced motion nothing moves: the leaf is simply there", () => {
        rec = recordAnimations();
        undoMotion = reducedMotion(true);
        const { page } = draw();
        page.byClass("reader-survived-mark")[0].oneByClass("reader-survived-pick").click();
        expect(rec.animations).toHaveLength(0);
    });

    it("drawn without motion asked, nothing moves either", () => {
        rec = recordAnimations();
        draw({ motion: false });
        expect(rec.animations).toHaveLength(0);
    });
});

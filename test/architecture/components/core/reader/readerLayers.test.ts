/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterEach, beforeEach } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import {
    MarkVisibility,
    REVEAL_WITHIN_MS,
    layerPrefsOf,
    markShown,
    normalizeLayerPrefs,
    revealSchedule,
    withLayerPrefs,
    type LayerState,
} from "architecture/components/core/reader/readerLayers";
import { LIBRARY_LIMIT } from "application/library/sourceMeta";
import type { Thought } from "application/thinking/thought";

const cls = (name: string) => `zettelkasten-flow__${name}`;
const shown: LayerState = { hidden: [], clean: false, cleanSince: 0 };

describe("the rule: what is drawn (#758 AC-3, FR-7, FR-8)", () => {
    const reading = { at: 10 };
    const reflection = { at: 10, layer: "reflection" as const, meaning: "question" as const };

    it("draws a mark when its layer is shown and its meaning chosen — both narrow", () => {
        for (const hidden of [[], ["reading"], ["reflection"], ["reading", "reflection"]] as const) {
            for (const meaning of [null, "idea", "question"] as const) {
                const state: LayerState = { ...shown, hidden, meaning };
                expect(markShown(reading, state)).toBe(!hidden.includes("reading" as never) && (meaning === null || meaning === "idea"));
                expect(markShown(reflection, state)).toBe(!hidden.includes("reflection" as never) && (meaning === null || meaning === "question"));
            }
        }
    });

    it("reading clean puts every mark away but the ones made while clean", () => {
        const clean: LayerState = { ...shown, clean: true, cleanSince: 100 };
        expect(markShown({ at: 99 }, clean)).toBe(false);
        expect(markShown({ at: 100 }, clean)).toBe(true);
        expect(markShown({ at: 150, layer: "research" }, clean)).toBe(true);
        // …and a mark made while clean is still on its layer: a hidden layer hides it.
        expect(markShown({ at: 150, layer: "research" }, { ...clean, hidden: ["research"] })).toBe(false);
        expect(markShown({ at: 99 }, { ...clean, clean: false })).toBe(true);
    });
});

describe("the order of a reveal (#758 AC-5, FR-13)", () => {
    it("is the order the marks were made, 350 ms apart", () => {
        const marks = [{ id: "c", at: 30 }, { id: "a", at: 10 }, { id: "b", at: 20 }];
        expect(revealSchedule(marks).map(({ mark, delay }) => [mark.id, delay])).toEqual([["a", 0], ["b", 350], ["c", 700]]);
    });

    it("comes closer so a whole chapter is back within four seconds", () => {
        const marks = Array.from({ length: 20 }, (_, i) => ({ at: 20 - i }));
        const schedule = revealSchedule(marks);
        expect(schedule.map((s) => s.delay)).toEqual(Array.from({ length: 20 }, (_, i) => i * 200));
        expect(schedule[0].mark.at).toBe(1);
        expect(schedule[schedule.length - 1].delay).toBeLessThanOrEqual(REVEAL_WITHIN_MS);
    });

    it("keeps marks made in the same moment in the order they are drawn", () => {
        expect(revealSchedule([{ id: "x", at: 5 }, { id: "y", at: 5 }]).map((s) => s.mark.id)).toEqual(["x", "y"]);
        expect(revealSchedule([])).toEqual([]);
    });
});

describe("what a source remembers (#758 AC-2, FR-4, FR-5)", () => {
    it("drops junk and keeps the target and the hidden layers per reading", () => {
        const map = normalizeLayerPrefs({
            "Books/a.epub": { target: "reflection", hidden: ["reading", "draft", 3] },
            "Papers/p.pdf": { target: "reading", hidden: [] },
            "Notes/n.md": { target: "nope", hidden: "reading" },
            bad: null,
        });
        expect(map).toEqual({ "Books/a.epub": { target: "reflection", hidden: ["reading"] } });
        expect(normalizeLayerPrefs(null)).toEqual({});
        expect(normalizeLayerPrefs([1, 2])).toEqual({});
        expect(layerPrefsOf(map, "Books/a.epub")).toEqual({ target: "reflection", hidden: ["reading"] });
        expect(layerPrefsOf(map, "Papers/p.pdf")).toEqual({ target: "reading", hidden: [] });
        expect(layerPrefsOf(map, null)).toEqual({ target: "reading", hidden: [] });
    });

    it("keeps no defaults, and forgets the oldest past the Library's limit", () => {
        let map = withLayerPrefs({}, "a", { target: "research", hidden: [] });
        expect(map).toEqual({ a: { target: "research" } });
        map = withLayerPrefs(map, "a", { target: "reading", hidden: [] });
        expect(map).toEqual({});
        let big: Record<string, any> = {};
        for (let i = 0; i <= LIBRARY_LIMIT; i++) big = withLayerPrefs(big, `k${i}`, { target: "reading", hidden: ["research"] });
        expect(Object.keys(big).length).toBe(LIBRARY_LIMIT);
        expect(big.k0).toBeUndefined();
        expect(big[`k${LIBRARY_LIMIT}`]).toEqual({ hidden: ["research"] });
    });
});

describe("the one mechanism (#758 FR-11, AC-5)", () => {
    let rec: AnimationRecord;
    let motion: () => void;
    beforeEach(() => {
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        rec.stop();
        motion();
    });

    function page(thoughts: Thought[]) {
        const root = new DomNode();
        const stage = root.createDiv({ cls: cls("reader-stage") });
        const body = stage.createDiv();
        for (const thought of thoughts) {
            const mark = body.createEl("mark", { cls: [cls("reader-highlight"), cls("reader-highlight--idea")], attr: { "data-hl": thought.id } });
            (mark as any).getClientRects = () => [{ left: 10, top: 20, width: 100, height: 18 }];
        }
        const port = { root: () => root as any, stage: () => stage as any, thoughts: () => thoughts, tintsOf: () => [], onScreen: () => true, selecting: () => false };
        return { root, stage, body, visibility: new MarkVisibility(port, () => 1000) };
    }
    const t = (id: string, at: number): Thought => ({ id, at, text: "", links: [], quote: { exact: id, prefix: "", suffix: "" } });
    const away = (root: DomNode) => root.byClass("reader-highlight").filter((m) => m.hasClass(cls("reader-highlight--away"))).map((m) => m.getAttribute("data-hl"));

    it("hides all and reveals in made order; finish() mid-way shows all at once", () => {
        const { root, visibility } = page([t("b", 2), t("a", 1), t("c", 3)]);
        visibility.hideAll();
        rec.finishAll();
        expect(away(root)).toEqual(["b", "a", "c"]);
        rec.animations.length = 0;
        visibility.reveal();
        const lifts = rec.animations.filter((a) => (a.target as DomNode).hasClass(cls("reader-ink-lift")));
        expect(lifts.map((a) => (a.options as any).delay)).toEqual([0, 350, 700]);
        expect(away(root)).toEqual(["b", "a", "c"]);
        visibility.finish();
        expect(away(root)).toEqual([]);
        expect(root.byClass("reader-ink-lift")).toEqual([]);
    });

    it("hides ink, a printed page's wash and margin rows by the same rule, each by its own opacity (AC-3)", () => {
        const ink: Thought = { ...t("ink", 1), layer: "reflection" };
        const wash = t("wash", 2);
        const { root, visibility } = page([]);
        const note = root.createSvg("g", { cls: cls("reader-ink-note"), attr: { "data-ink": "ink" } });
        const rect = root.createDiv({ cls: cls("reader-ink-pagemark"), attr: { "data-hl": "wash" } });
        const row = root.createDiv({ cls: cls("reader-hl-item"), attr: { "data-ink": "ink" } });
        // An element that only names a mark — a chapter end's row, a card — is never put away.
        const other = root.createDiv({ cls: cls("reader-survived-mark"), attr: { "data-hl": "wash" } });
        (visibility as any).port.thoughts = () => [ink, wash];
        visibility.hideLayer("reflection");
        rec.finishAll();
        const away = (el: DomNode) => el.hasClass(cls("reader-highlight--away"));
        expect([away(note), away(row), away(rect)]).toEqual([true, true, false]);
        expect(rec.animations.every((a) => a.keyframes.every((frame) => Object.keys(frame).every((key) => key === "opacity")))).toBe(true);
        visibility.hideAll();
        rec.finishAll();
        expect([away(rect), away(other)]).toEqual([true, false]);
    });

    it("under reduced motion, every mark leaves and returns at once", () => {
        motion();
        motion = reducedMotion(true);
        const { root, visibility } = page([t("a", 1), t("b", 2)]);
        visibility.hideAll();
        expect(away(root)).toEqual(["a", "b"]);
        visibility.reveal();
        expect(away(root)).toEqual([]);
        expect(rec.animations).toEqual([]);
    });
});

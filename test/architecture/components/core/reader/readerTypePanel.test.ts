/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { renderTypePanel, segmentedRow, snapshotMarkers } from "architecture/components/core/reader/readerTypePanel";
import { DEFAULT_READER_PREFS, type ReaderPrefs } from "architecture/components/core/reader/readerPrefs";
import { MOTION } from "architecture/components/core/reader/readerMotion";

const scope = () => {
    const component = new Component();
    component.load();
    return component;
};

const rows = (host: DomNode) => host.byClass("reader-type-row");
const options = (row: DomNode) => row.byClass("reader-type-option");

describe("the Type panel, one row per choice (#753 FR-1, FR-14)", () => {
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

    it("puts Layout first, Scroll · Page · Spread, with the current one active and pressed", () => {
        const host = new DomNode();
        renderTypePanel(host as any, DEFAULT_READER_PREFS, scope(), jest.fn());
        const layout = rows(host)[0];
        expect(layout.oneByClass("reader-type-label").textContent).toBe("Layout");
        expect(options(layout).map((o) => o.text)).toEqual(["Scroll", "Page", "Spread"]);
        expect(options(layout).map((o) => o.hasClass("is-active"))).toEqual([true, false, false]);
        expect(options(layout).map((o) => o.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
        // Every row is labelled, and its group says which label is its.
        expect(rows(host).map((r) => r.oneByClass("reader-type-label").textContent)).toEqual(["Layout", "Look", "Font", "Size", "Line spacing", "Width", "Margins"]);
        const group = layout.oneByClass("reader-type-seg");
        expect(group.getAttribute("aria-labelledby")).toBe(layout.oneByClass("reader-type-label").getAttribute("id"));
    });

    it("hands the next prefs to the pick", () => {
        const host = new DomNode();
        const onPick = jest.fn<(next: ReaderPrefs) => void>();
        renderTypePanel(host as any, DEFAULT_READER_PREFS, scope(), onPick);
        options(rows(host)[0])[2].click();
        expect(onPick).toHaveBeenCalledWith({ ...DEFAULT_READER_PREFS, layout: "spread" });
    });

    it("slides the marker from the answer that had it, by transform alone, in 120 ms", () => {
        const host = new DomNode();
        renderTypePanel(host as any, DEFAULT_READER_PREFS, scope(), jest.fn());
        const before = snapshotMarkers(host as any);
        expect(before.get("layout")?.value).toBe("scroll");
        host.empty();
        renderTypePanel(host as any, { ...DEFAULT_READER_PREFS, layout: "page" }, scope(), jest.fn(), before);
        expect(rec.animations).toHaveLength(1);
        const [slide] = rec.animations;
        expect([...rec.keys()]).toEqual(["transform"]);
        expect(slide.options).toMatchObject({ duration: MOTION.fast, easing: MOTION.ease });
        expect(slide.target.hasClass("zettelkasten-flow__reader-type-marker")).toBe(true);
        expect(slide.target.parent.text).toBe("Page");
    });

    it("does not slide what did not change, nor anything under reduced motion", () => {
        const host = new DomNode();
        renderTypePanel(host as any, DEFAULT_READER_PREFS, scope(), jest.fn());
        const before = snapshotMarkers(host as any);
        host.empty();
        renderTypePanel(host as any, DEFAULT_READER_PREFS, scope(), jest.fn(), before);
        expect(rec.animations).toHaveLength(0);
        motion();
        motion = reducedMotion(true);
        host.empty();
        renderTypePanel(host as any, { ...DEFAULT_READER_PREFS, size: "large" }, scope(), jest.fn(), before);
        expect(rec.animations).toHaveLength(0);
    });

    it("is one control a later row reuses: any options, its own id", () => {
        const host = new DomNode();
        const onPick = jest.fn();
        segmentedRow(host as any, { id: "spacing", label: "reader_layout", options: ["tight", "loose"] as const, current: "loose", key: () => "reader_layout_page", onPick }, scope());
        expect(rows(host)[0].getAttribute("data-zf-row")).toBe("spacing");
        options(rows(host)[0])[0].click();
        expect(onPick).toHaveBeenCalledWith("tight");
    });

    it("slides the marker of each finer row by transform alone, in 120 ms, and never under reduced motion (#757 FR-15, FR-16)", () => {
        const picks: [string, Partial<ReaderPrefs>, string][] = [
            ["spacing", { spacing: "airy" }, "Airy"],
            ["width", { width: "wide" }, "Wide"],
            ["margins", { margins: "large" }, "Large"],
        ];
        for (const [id, change, label] of picks) {
            const host = new DomNode();
            renderTypePanel(host as any, DEFAULT_READER_PREFS, scope(), jest.fn());
            const before = snapshotMarkers(host as any);
            expect(before.has(id)).toBe(true);
            host.empty();
            rec.animations.length = 0;
            renderTypePanel(host as any, { ...DEFAULT_READER_PREFS, ...change }, scope(), jest.fn(), before);
            expect(rec.animations).toHaveLength(1);
            expect(rec.animations[0].options).toMatchObject({ duration: MOTION.fast, easing: MOTION.ease });
            expect(rec.animations[0].target.parent.text).toBe(label);
            expect(Object.keys(rec.animations[0].keyframes[0])).toEqual(["transform"]);
        }
        motion();
        motion = reducedMotion(true);
        const host = new DomNode();
        renderTypePanel(host as any, DEFAULT_READER_PREFS, scope(), jest.fn());
        const before = snapshotMarkers(host as any);
        host.empty();
        rec.animations.length = 0;
        renderTypePanel(host as any, { ...DEFAULT_READER_PREFS, width: "narrow" }, scope(), jest.fn(), before);
        expect(rec.animations).toHaveLength(0);
    });

    it("says the hyphens' language only with Justify on, and Page view's note when asked (#757 FR-7)", () => {
        const host = new DomNode();
        renderTypePanel(host as any, DEFAULT_READER_PREFS, scope(), jest.fn(), undefined, { hyphenatedAs: "Spanish" });
        expect(host.byClass("reader-type-hint")).toHaveLength(0);
        host.empty();
        renderTypePanel(host as any, { ...DEFAULT_READER_PREFS, justify: true }, scope(), jest.fn(), undefined, { hyphenatedAs: "Spanish", pageView: true });
        expect(host.byClass("reader-type-hint").map((el) => el.textContent)).toEqual(["Hyphenated as Spanish"]);
        expect(host.byClass("reader-type-note")).toHaveLength(1);
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    SNAPSHOT_MAX_AREA,
    SNAPSHOT_MAX_SIDE,
    appendMarkdown,
    captureRegion,
    captureScale,
    fleetingText,
    normalizeRect,
    noteMarkdown,
    regionFractions,
    snapshotName,
    tooSmall,
} from "architecture/components/core/reader/readerSnapshot";
import { recallCitation } from "application/library/recallNote";
import { mimeToExtension } from "architecture/components/core/export/exportFilename";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * **Snapshot a figure or a table** (#763), the pure half: the region's math (AC-1) and what each
 * destination writes (AC-2), the citation through #751's one producer.
 */

describe("the region and its size (#763 AC-1)", () => {
    it("draws a region at twice the size it has on screen", () => {
        // 1.5 CSS px per point, a 300 × 200 pt region: 3 px per point.
        expect(captureScale(1.5, { width: 300, height: 200 })).toBe(3);
    });

    it("never past 4,096 px on its long side", () => {
        expect(captureScale(2, { width: 3000, height: 1000 })).toBeCloseTo(SNAPSHOT_MAX_SIDE / 3000, 6);
        expect(3000 * captureScale(4, { width: 3000, height: 1000 })).toBeLessThanOrEqual(SNAPSHOT_MAX_SIDE + 1e-6);
    });

    it("never past 16 M px of area, the iPad's canvas limit (T8)", () => {
        const scale = captureScale(10, { width: 2000, height: 2000 });
        expect(2000 * scale * 2000 * scale).toBeLessThanOrEqual(SNAPSHOT_MAX_AREA + 1);
        expect(2000 * scale).toBeLessThanOrEqual(SNAPSHOT_MAX_SIDE);
    });

    it("captures nothing under 20 px on a side (FR-4)", () => {
        expect(tooSmall({ width: 19, height: 200 })).toBe(true);
        expect(tooSmall({ width: 200, height: 19 })).toBe(true);
        expect(tooSmall({ width: 20, height: 20 })).toBe(false);
    });

    it("spans a rectangle whichever way the drag went", () => {
        expect(normalizeRect({ x: 300, y: 250 }, { x: 100, y: 50 })).toEqual({ left: 100, top: 50, width: 200, height: 200 });
    });

    it("takes the same shares of the page at any zoom, held inside it", () => {
        const page = { left: 100, top: 40, width: 600, height: 800 };
        const at1 = regionFractions({ left: 160, top: 120, width: 300, height: 200 }, page);
        // The page and the drag twice as big on screen: the same part of the page.
        const at2 = regionFractions({ left: 220, top: 200, width: 600, height: 400 }, { left: 100, top: 40, width: 1200, height: 1600 });
        expect(at1).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.25 });
        expect(at2).toEqual(at1);
        // Past the page's edge: held at its edge.
        expect(regionFractions({ left: 50, top: 0, width: 200, height: 100 }, page)).toEqual({ x: 0, y: 0, w: 0.25, h: 0.075 });
    });
});

describe("what a snapshot writes (#763 AC-2)", () => {
    const citation = recallCitation({ file: "Papers/paper.pdf", chapter: "page:3", label: "p. 4", page: "4", bookTitle: "Reference class forecasting" });
    const embed = "![[Reference class forecasting p. 4.png]]";

    it("cites the source and its page through #751's one producer", () => {
        expect(citation).toBe("[[Papers/paper.pdf#page=4|Reference class forecasting]] p. 4");
    });

    it("writes a new note: the image, your caption, and the source line", () => {
        expect(noteMarkdown({ embed, caption: "  Optimism bias, by project type  ", citation })).toBe(
            "![[Reference class forecasting p. 4.png]]\n\nOptimism bias, by project type\n\nsource:: [[Papers/paper.pdf#page=4|Reference class forecasting]] p. 4\n"
        );
        // No caption, no empty line for it.
        expect(noteMarkdown({ embed, caption: "", citation })).toBe(`${embed}\n\nsource:: ${citation}\n`);
    });

    it("appends the image and its source line to a note you chose", () => {
        expect(appendMarkdown({ embed, citation })).toBe("![[Reference class forecasting p. 4.png]]\nsource:: [[Papers/paper.pdf#page=4|Reference class forecasting]] p. 4");
    });

    it("keeps a fleeting note whose text is the image (its page rides in the thought's place)", () => {
        expect(fleetingText({ embed })).toBe(embed);
    });

    it("names the image after the source and the place, sanitised", () => {
        expect(snapshotName("Reference class forecasting", "p. 4")).toBe("Reference class forecasting p. 4");
        expect(snapshotName('A: "risky" / plan?', "ch. 3")).toBe("A risky plan ch. 3");
        expect(snapshotName("", "p. 1")).toBe("Book p. 1");
    });

    it("keeps a book's picture in its own format (FR-3)", () => {
        expect(mimeToExtension("image/png")).toBe("png");
        expect(mimeToExtension("image/jpeg")).toBe("jpg");
        expect(mimeToExtension("image/gif")).toBe("gif");
        expect(mimeToExtension("image/svg+xml")).toBe("svg");
    });
});

describe("a region drawn again, never the screen (#763 FR-3, T8)", () => {
    function scratch() {
        const canvas: any = { width: 0, height: 0, toBlob: (done: (b: Blob | null) => void, type: string) => done(new Blob(["png"], { type })) };
        const doc: any = () => canvas;
        return { canvas, doc };
    }

    it("renders the page at the scale and frame asked, and gives a PNG", async () => {
        const { canvas, doc } = scratch();
        const asked: any[] = [];
        const render = (page: number, into: any, options: any) => {
            asked.push({ page, options });
            into.width = 600;
            into.height = 400;
            return { promise: Promise.resolve(), cancel: () => undefined };
        };
        const blob = await captureRegion(render as never, doc, 3, { scale: 3, rotation: 0, frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } });
        expect(asked).toEqual([{ page: 3, options: { scale: 3, rotation: 0, frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } } }]);
        expect(blob?.type).toBe("image/png");
        // The scratch canvas is let go at once: WebKit counts it until its width is zero.
        expect(canvas.width).toBe(0);
        expect(canvas.height).toBe(0);
    });

    it("gives nothing when the page could not be drawn, and still lets the canvas go", async () => {
        const { canvas, doc } = scratch();
        const render = () => ({ promise: Promise.reject(new Error("broken")), cancel: () => undefined });
        await expect(captureRegion(render as never, doc, 0, { scale: 2, rotation: 0 })).rejects.toThrow("broken");
        expect(canvas.width).toBe(0);
    });
});

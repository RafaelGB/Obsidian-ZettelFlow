import { describe, it, expect, jest } from "@jest/globals";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { renderInkCard } from "architecture/components/core/lab/labInkCard";
import { renderInkSvg } from "application/reader/ink/inkSvg";
import type { Thought } from "application/thinking/thought";

const ink: Thought = {
    id: "i1",
    at: 1,
    text: "",
    links: [],
    about: "Books/a.epub",
    quote: { exact: "interface", prefix: "", suffix: "" },
    ink: { drawing: "1-i1.svg", side: "right", x: 0.1, line: 0, em: 16 },
};
const SVG = renderInkSvg({ strokes: [{ colour: "blue", pointerType: "pen", points: [0, 1, 2].map((x) => ({ x, y: 0, p: 0.5, tilt: Math.PI / 2, t: x })) }] });

describe("ink in Think: a card of handwriting (#745 FR-13)", () => {
    it("draws the drawing with createSvg, not the passage, and says where it was written", async () => {
        const box = new DomNode();
        const open = jest.fn();
        renderInkCard(box as never, ink, { drawing: async () => SVG, name: "A book", open, listen: (el, run) => (el as unknown as DomNode).addEventListener("click", run) });
        await flush();
        const svg = box.oneByClass("reader-ink-thumb");
        expect(svg.svg).toBe(true);
        expect(svg.findAll((el) => el.tag === "path").length).toBeGreaterThan(0);
        expect(box.byClass("reader-ink--blue")).toHaveLength(1);
        expect(box.byClass("lab-quote-text")).toHaveLength(0);
        expect(box.oneByClass("lab-ink-label").textContent).toBe("Your handwriting");
        expect(box.byText("A book")).toBeDefined();
        box.byText("Open in the Reader")?.click();
        expect(open).toHaveBeenCalled();
    });

    it("shows its card with no drawing while the drawing has not arrived (sync)", async () => {
        const box = new DomNode();
        renderInkCard(box as never, ink, { drawing: async () => undefined, name: "A book", listen: () => undefined });
        await flush();
        expect(box.byClass("reader-ink-thumb")).toHaveLength(0);
        expect(box.byClass("lab-ink")).toHaveLength(1);
    });
});

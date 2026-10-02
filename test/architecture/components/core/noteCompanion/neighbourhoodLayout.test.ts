import { describe, it, expect } from "@jest/globals";
import {
    CAP,
    CHAR_W,
    LABEL_CHARS,
    layoutNeighbourhood,
    type LayoutNode,
} from "architecture/components/core/noteCompanion/neighbourhoodLayout";
import type { Neighbour } from "architecture/knowledge/state";

const neighbour = (i: number, title = `Note ${i}`): Neighbour => ({
    path: `n${i}.md`,
    title,
    cls: "link",
    inbound: false,
    outbound: true,
    outType: "link",
});
const many = (n: number) => Array.from({ length: n }, (_, i) => neighbour(i));
const near = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `near${i}.md`, title: `Near ${i}` }));

/** The label's box, from its anchor and an estimated width. */
function labelBox(node: LayoutNode) {
    const width = node.label.length * CHAR_W;
    const left = node.anchor === "start" ? node.labelX : node.anchor === "end" ? node.labelX - width : node.labelX - width / 2;
    return { left, right: left + width, top: node.labelY - 10, bottom: node.labelY + 2 };
}

describe("the neighbourhood layout (#643 FR-5/7/8, AC-1)", () => {
    for (const n of [0, 1, 5, 12, 13]) {
        it(`places ${n} neighbours inside the box, clockwise from twelve o'clock`, () => {
            const layout = layoutNeighbourhood(many(n), []);
            const inner = layout.nodes.filter((node) => !node.isNear);
            expect(inner).toHaveLength(Math.min(n, CAP));
            expect(layout.overflow).toBe(Math.max(0, n - CAP));
            if (inner.length > 0) {
                // The first sits straight above the centre.
                expect(inner[0].x).toBeCloseTo(layout.cx);
                expect(inner[0].y).toBeLessThan(layout.cy);
            }
            if (inner.length > 2) {
                // Clockwise: the second is to the right of the first.
                expect(inner[1].x).toBeGreaterThan(inner[0].x);
            }
            for (const node of layout.nodes) {
                const box = labelBox(node);
                expect(box.left).toBeGreaterThanOrEqual(0);
                expect(box.right).toBeLessThanOrEqual(layout.width);
                expect(box.top).toBeGreaterThanOrEqual(0);
                expect(box.bottom).toBeLessThanOrEqual(layout.height);
            }
        });
    }

    it("anchors labels by side", () => {
        const layout = layoutNeighbourhood(many(4), []);
        expect(layout.nodes.map((node) => node.anchor)).toEqual(["middle", "start", "middle", "end"]);
    });

    it("is the same picture every time", () => {
        expect(layoutNeighbourhood(many(7), near(2))).toEqual(layoutNeighbourhood(many(7), near(2)));
    });

    it("shortens a long title to fit, with an ellipsis", () => {
        const [node] = layoutNeighbourhood([neighbour(0, "A very long title that never ends")], []).nodes;
        expect(node.label).toBe(`${"A very long title that never ends".slice(0, LABEL_CHARS)}…`);
        expect(node.title).toBe("A very long title that never ends");
    });
});

describe("the near ring (#643 FR-4, AC-2)", () => {
    for (const k of [1, 2, 3]) {
        it(`puts ${k} near notes on the outer ring, between the neighbours`, () => {
            const layout = layoutNeighbourhood(many(4), near(k));
            const inner = layout.nodes.filter((node) => !node.isNear);
            const outer = layout.nodes.filter((node) => node.isNear);
            expect(outer).toHaveLength(k);
            const radius = (node: LayoutNode) => Math.hypot((node.x - layout.cx) / layout.rx, (node.y - layout.cy) / layout.ry);
            for (const node of outer) {
                expect(node.cls).toBe("near");
                expect(radius(node)).toBeGreaterThan(Math.max(...inner.map(radius)));
                for (const other of inner) {
                    expect(Math.atan2(node.y - layout.cy, node.x - layout.cx)).not.toBeCloseTo(
                        Math.atan2(other.y - layout.cy, other.x - layout.cx)
                    );
                }
            }
        });
    }

    it("spreads the near notes evenly when there is nothing linked", () => {
        const layout = layoutNeighbourhood([], near(3));
        expect(layout.nodes).toHaveLength(3);
        expect(layout.nodes[0].x).toBeCloseTo(layout.cx);
    });
});

import { describe, it, expect } from "@jest/globals";
import { cycleHeight, cycleWidth, layoutClasses, movePanel, panelLayout } from "dashboards/panels";
import type { PanelConfig } from "dashboards/panels";

function panel(id: string): PanelConfig {
    return { id, type: "stat", mapping: {} };
}

describe("dashboard layout (S3)", () => {
    it("defaults to a 1x1 cell", () => {
        expect(panelLayout(panel("a"))).toEqual({ w: 1, h: 1 });
    });

    it("cycles width 1 -> 2 -> 3 -> 1", () => {
        expect(cycleWidth({ w: 1, h: 1 }).w).toBe(2);
        expect(cycleWidth({ w: 2, h: 1 }).w).toBe(3);
        expect(cycleWidth({ w: 3, h: 1 }).w).toBe(1);
    });

    it("cycles height 1 -> 2 -> 1", () => {
        expect(cycleHeight({ w: 1, h: 1 }).h).toBe(2);
        expect(cycleHeight({ w: 1, h: 2 }).h).toBe(1);
    });

    it("moves a panel within bounds and is a no-op at the ends", () => {
        const panels = [panel("a"), panel("b"), panel("c")];
        expect(movePanel(panels, "b", -1).map((p) => p.id)).toEqual(["b", "a", "c"]);
        expect(movePanel(panels, "b", 1).map((p) => p.id)).toEqual(["a", "c", "b"]);
        expect(movePanel(panels, "a", -1).map((p) => p.id)).toEqual(["a", "b", "c"]);
        expect(movePanel(panels, "c", 1).map((p) => p.id)).toEqual(["a", "b", "c"]);
    });

    it("does not mutate the input array", () => {
        const panels = [panel("a"), panel("b")];
        movePanel(panels, "a", 1);
        expect(panels.map((p) => p.id)).toEqual(["a", "b"]);
    });

    it("maps a layout to scoped modifier classes", () => {
        expect(layoutClasses({ w: 2, h: 1 })).toEqual(["is-w2", "is-h1"]);
        expect(layoutClasses({ w: 3, h: 2 })).toEqual(["is-w3", "is-h2"]);
    });
});

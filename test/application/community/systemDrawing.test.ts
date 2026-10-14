import { describe, it, expect } from "@jest/globals";
import {
    NEUTRAL_COLOR,
    colorClass,
    drawingOf,
    frameStep,
    pointsAlong,
    systemDrawing,
} from "application/community/systemDrawing";
import { STILL } from "architecture/components/core/reader/readerShot";
import { branching, parseYamlForTests, scripted, single } from "../../support/systemsFixtures";

describe("a system drawn as it is (#799 AC-2)", () => {
    it("draws one node per step and one path per edge, and counts the branch points", () => {
        const drawing = drawingOf(branching(), parseYamlForTests);
        expect(drawing.nodes.map((node) => node.id)).toEqual(["cap", "fleeting", "literature", "permanent"]);
        expect(drawing.edges.map((edge) => edge.id)).toEqual(["e1", "e2", "e3"]);
        expect(drawing.steps).toBe(4);
        expect(drawing.branches).toBe(1);
        for (const edge of drawing.edges) expect(edge.d).toMatch(/^M[-\d.]+,[-\d.]+ C/);
    });

    it("labels each node with its step's label, its phase and its questions", () => {
        const cap = drawingOf(branching(), parseYamlForTests).nodes[0];
        expect(cap.label).toBe("Capture a Zettel");
        expect(cap.phase).toBe("CAPTURE");
        expect(cap.asks).toEqual(["Title", "What kind of note is this?"]);
    });

    it("counts an inline box with a zettelflowConfig as a step, and a file step too", () => {
        expect(drawingOf(single(), parseYamlForTests).steps).toBe(1);
        expect(drawingOf(scripted(), parseYamlForTests).steps).toBe(1);
        // With no step table, a node is a step when it carries a config or points at a note.
        const bare = systemDrawing({
            nodes: [
                { id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, zettelflowConfig: "{\"label\":\"A\"}" },
                { id: "b", type: "file", file: "B.md", x: 20, y: 0, width: 10, height: 10 },
                { id: "c", type: "text", text: "just a sticky note", x: 40, y: 0, width: 10, height: 10 },
            ],
            edges: [{ id: "ab", fromNode: "a", toNode: "b" }, { id: "bc", fromNode: "b", toNode: "c" }],
        });
        expect(bare.nodes.map((node) => node.id)).toEqual(["a", "b"]);
        expect(bare.edges.map((edge) => edge.id)).toEqual(["ab"]);
        expect(bare.nodes[1].label).toBe("B");
    });

    it("colours a node by the canvas colour, and a hex colour by the neutral class", () => {
        const colours = drawingOf(branching(), parseYamlForTests).nodes.map((node) => node.colorClass);
        expect(colours).toEqual(["system-node--c1", "system-node--c1", "system-node--c3", NEUTRAL_COLOR]);
        expect(colorClass(undefined)).toBe(NEUTRAL_COLOR);
        expect(colorClass("7")).toBe(NEUTRAL_COLOR);
    });

    it("frames the whole drawing with room around it", () => {
        const drawing = drawingOf(branching(), parseYamlForTests);
        const { x, y, width, height } = drawing.viewBox;
        for (const node of drawing.nodes) {
            expect(node.x).toBeGreaterThan(x);
            expect(node.y).toBeGreaterThan(y);
            expect(node.x + node.w).toBeLessThan(x + width);
            expect(node.y + node.h).toBeLessThan(y + height);
        }
    });

    it("frames a step and its neighbours inside the frame, and a lone step not at all", () => {
        const drawing = drawingOf(branching(), parseYamlForTests);
        const frame = { width: 800, height: 450 };
        const cam = frameStep(drawing, "fleeting", frame);
        expect(cam.s).toBeGreaterThan(1);
        // The step it frames, seen through the camera, sits inside the frame.
        const vb = drawing.viewBox;
        const base = Math.min(frame.width / vb.width, frame.height / vb.height);
        const ox = (frame.width - vb.width * base) / 2;
        const oy = (frame.height - vb.height * base) / 2;
        const node = drawing.nodes.find((n) => n.id === "fleeting")!;
        const left = ((node.x - vb.x) * base + ox) * cam.s + cam.x;
        const top = ((node.y - vb.y) * base + oy) * cam.s + cam.y;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(left + node.w * base * cam.s).toBeLessThanOrEqual(frame.width);
        expect(top + node.h * base * cam.s).toBeLessThanOrEqual(frame.height);
        expect(frameStep(drawingOf(single(), parseYamlForTests), "only", frame)).toEqual(STILL);
    });

    it("samples a point along an edge from its start to its end", () => {
        const edge = drawingOf(branching(), parseYamlForTests).edges[0];
        const points = pointsAlong(edge, 5);
        expect(points).toHaveLength(5);
        expect(points[0]).toEqual({ x: edge.curve[0], y: edge.curve[1] });
        expect(points[4]).toEqual({ x: edge.curve[6], y: edge.curve[7] });
    });
});

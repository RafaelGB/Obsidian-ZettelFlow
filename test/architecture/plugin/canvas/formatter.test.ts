import { describe, it, expect } from "@jest/globals";
import { canvasJsonFormatter } from "architecture/plugin/canvas/formatter";
import type { CanvasData } from "obsidian/canvas";

describe("canvasJsonFormatter", () => {
    it("produces valid JSON with nodes and edges", () => {
        const data = {
            nodes: [{ id: "a", type: "text", text: "hello", x: 0, y: 0, width: 10, height: 10 }],
            edges: [{ id: "e1", fromNode: "a", toNode: "b" }],
        } as unknown as CanvasData;

        const parsed = JSON.parse(canvasJsonFormatter(data));
        expect(parsed.nodes).toHaveLength(1);
        expect(parsed.nodes[0].id).toBe("a");
        expect(parsed.edges).toHaveLength(1);
        expect(parsed.edges[0].id).toBe("e1");
    });

    it("preserves unknown top-level keys (no data loss on save)", () => {
        const data = {
            nodes: [],
            edges: [],
            metadata: { foo: 1, nested: { bar: "baz" } },
            futureField: "keep me",
        } as unknown as CanvasData;

        const parsed = JSON.parse(canvasJsonFormatter(data));
        expect(parsed.metadata).toEqual({ foo: 1, nested: { bar: "baz" } });
        expect(parsed.futureField).toBe("keep me");
    });

    it("still pretty-prints nodes and edges one per line", () => {
        const data = {
            nodes: [
                { id: "a", type: "text", text: "1", x: 0, y: 0, width: 1, height: 1 },
                { id: "b", type: "text", text: "2", x: 0, y: 0, width: 1, height: 1 },
            ],
            edges: [],
        } as unknown as CanvasData;

        const out = canvasJsonFormatter(data);
        // Two node lines means one newline between the two serialized nodes.
        expect(out).toContain('"id":"a"');
        expect(out).toContain('"id":"b"');
        expect(out.split("\n").length).toBeGreaterThan(2);
    });

    it("round-trips an empty canvas", () => {
        const data = { nodes: [], edges: [] } as unknown as CanvasData;
        const parsed = JSON.parse(canvasJsonFormatter(data));
        expect(parsed.nodes).toEqual([]);
        expect(parsed.edges).toEqual([]);
    });
});

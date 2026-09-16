import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import {
    flowFindings,
    type FlowEdgeShape,
    type FlowShape,
    type FlowStepShape,
} from "application/notes/flowFindings";

const step = (id: string, extra: Partial<FlowStepShape> = {}): FlowStepShape => ({
    id,
    label: id,
    kind: "text",
    asks: 1,
    ...extra,
});

const edge = (from: string, to: string, extra: Partial<FlowEdgeShape> = {}): FlowEdgeShape => ({
    id: `e-${from}-${to}`,
    fromNode: from,
    toNode: to,
    ...extra,
});

function flow(steps: FlowStepShape[], edges: FlowEdgeShape[]): FlowShape {
    const adjacency = new Map<string, string[]>(steps.map((entry) => [entry.id, []]));
    for (const link of edges) adjacency.get(link.fromNode)?.push(link.toNode);
    return { steps, edges, adjacency };
}

const kinds = (shape: FlowShape) => flowFindings(shape).map((finding) => finding.kind);

describe("a flow says what is recorded about it (#428)", () => {
    it("says nothing about a flow that holds together", () => {
        const shape = flow(
            [step("root", { root: true }), step("leaf", { hasTemplate: true, asks: 0 })],
            [edge("root", "leaf")]
        );
        expect(flowFindings(shape)).toEqual([]);
    });

    it("names a file step whose note is gone, with the path", () => {
        const shape = flow(
            [step("root", { root: true }), step("gone", { kind: "file", path: "Steps/Old.md", missing: true })],
            [edge("root", "gone")]
        );
        const [finding] = flowFindings(shape);
        expect(finding.kind).toBe("missing-note");
        expect(finding.detail).toBe("Steps/Old.md");
        expect(finding.nodeId).toBe("gone");
    });

    it("says a flow cannot start, once, instead of calling every step unreachable", () => {
        const shape = flow([step("a"), step("b")], [edge("a", "b")]);
        expect(kinds(shape)).toEqual(["no-root"]);
    });

    it("counts several roots without calling it a mistake", () => {
        const shape = flow(
            [step("a", { root: true }), step("b", { root: true })],
            []
        );
        const finding = flowFindings(shape).find((entry) => entry.kind === "several-roots");
        expect(finding?.detail).toBe("2");
    });

    it("names a step nothing points at", () => {
        const shape = flow(
            [step("root", { root: true }), step("island")],
            []
        );
        const finding = flowFindings(shape).find((entry) => entry.kind === "unreachable");
        expect(finding?.nodeId).toBe("island");
    });

    it("names a step that ends the flow without contributing anything", () => {
        const shape = flow(
            [step("root", { root: true }), step("empty", { asks: 0 })],
            [edge("root", "empty")]
        );
        expect(kinds(shape)).toEqual(["dead-end"]);
    });

    it("leaves a leaf alone when it writes, asks or files something", () => {
        for (const contribution of [{ asks: 2 }, { asks: 0, hasTemplate: true }, { asks: 0, hasTarget: true }]) {
            const shape = flow(
                [step("root", { root: true }), step("leaf", contribution)],
                [edge("root", "leaf")]
            );
            expect(kinds(shape)).toEqual([]);
        }
    });

    it("names two sibling options that read the same", () => {
        const shape = flow(
            [step("root", { root: true }), step("a"), step("b")],
            [edge("root", "a", { says: "Source" }), edge("root", "b", { says: "source" })]
        );
        const finding = flowFindings(shape).find((entry) => entry.kind === "duplicate-option");
        expect(finding?.nodeId).toBe("root");
        expect(finding?.detail).toBe("source");
    });

    it("falls back to the destination's name when an exit says nothing", () => {
        const shape = flow(
            [step("root", { root: true }), step("Idea"), step("Idea2", { label: "Idea" })],
            [edge("root", "Idea"), edge("root", "Idea2")]
        );
        expect(kinds(shape)).toContain("duplicate-option");
    });

    it("names a gate waiting on a key nothing in the flow writes", () => {
        const shape = flow(
            [step("root", { root: true }), step("a")],
            [edge("root", "a", { when: 'frontmatter.state === "permanent"' })]
        );
        const finding = flowFindings(shape).find((entry) => entry.kind === "gate-unknown-key");
        expect(finding?.detail).toBe("state");
        expect(finding?.nodeId).toBe("root");
    });

    it("stays quiet when another step in the same flow writes that key (AC-2)", () => {
        const shape = flow(
            [step("root", { root: true, writesKeys: ["state"] }), step("a")],
            [edge("root", "a", { when: 'frontmatter.state === "permanent"' })]
        );
        expect(kinds(shape)).toEqual([]);
    });

    it("reports each unwritten key once per gate, not once per mention", () => {
        const shape = flow(
            [step("root", { root: true }), step("a")],
            [
                edge("root", "a", {
                    when: 'frontmatter.state === "x" || frontmatter.state === "y"',
                }),
            ]
        );
        expect(kinds(shape).filter((kind) => kind === "gate-unknown-key")).toHaveLength(1);
    });
});

describe("the review never touches the flow (#428, AC-6)", () => {
    it("imports no writer", () => {
        const source = readFileSync(
            join(__dirname, "..", "..", "..", "src", "application", "notes", "flowFindings.ts"),
            "utf8"
        );
        // A reading that can write is not a reading. The module imports nothing at all today; the
        // assertion is about what it may never reach for.
        for (const forbidden of ["obsidian", "FileService", "Vault", "editTextNode", "canvas"]) {
            expect(source.includes(`from "${forbidden}`)).toBe(false);
        }
        expect(/^import /m.test(source)).toBe(false);
    });
});

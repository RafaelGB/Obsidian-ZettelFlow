import { describe, it, expect } from "@jest/globals";
import {
    buildBindings,
    matchBindings,
    type FlowTriggerSource,
    type WorkflowBinding,
} from "architecture/plugin/events/bindings";

describe("binding model, build-from-flow-scan, and match (FR-3, AC-1 support)", () => {
    describe("buildBindings", () => {
        it("maps a root node's trigger to a binding carrying its flow + node identity", () => {
            const flows: FlowTriggerSource[] = [
                {
                    flowPath: "flows/fleeting.canvas",
                    roots: [
                        {
                            nodeId: "n1",
                            trigger: { event: "note.created", condition: "return true" },
                        },
                    ],
                },
            ];
            expect(buildBindings(flows)).toEqual([
                {
                    event: "note.created",
                    condition: "return true",
                    flowPath: "flows/fleeting.canvas",
                    nodeId: "n1",
                },
            ]);
        });

        it("produces no binding for a root without a trigger (back-compat)", () => {
            const flows: FlowTriggerSource[] = [
                { flowPath: "flows/legacy.canvas", roots: [{ nodeId: "n1" }] },
            ];
            expect(buildBindings(flows)).toEqual([]);
        });

        it("keeps only triggered roots when a flow mixes triggered and untriggered roots", () => {
            const flows: FlowTriggerSource[] = [
                {
                    flowPath: "flows/mixed.canvas",
                    roots: [
                        { nodeId: "a", trigger: { event: "note.modified" } },
                        { nodeId: "b" },
                    ],
                },
            ];
            const bindings = buildBindings(flows);
            expect(bindings).toHaveLength(1);
            expect(bindings[0]).toMatchObject({ event: "note.modified", nodeId: "a" });
        });

        it("skips a trigger whose event is not a known token", () => {
            const flows: FlowTriggerSource[] = [
                {
                    flowPath: "flows/bad.canvas",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    roots: [{ nodeId: "a", trigger: { event: "not.an.event" as any } }],
                },
            ];
            expect(buildBindings(flows)).toEqual([]);
        });

        it("carries the root's file path when present (for frontmatter write-back)", () => {
            const flows: FlowTriggerSource[] = [
                {
                    flowPath: "flows/f.canvas",
                    roots: [
                        {
                            nodeId: "a",
                            filePath: "steps/root.md",
                            trigger: { event: "note.created" },
                        },
                    ],
                },
            ];
            expect(buildBindings(flows)[0].filePath).toBe("steps/root.md");
        });

        it("omits filePath for a text/group root (no linked file)", () => {
            const flows: FlowTriggerSource[] = [
                { flowPath: "flows/f.canvas", roots: [{ nodeId: "a", trigger: { event: "note.created" } }] },
            ];
            expect("filePath" in buildBindings(flows)[0]).toBe(false);
        });

        it("preserves the enabled flag when present", () => {
            const flows: FlowTriggerSource[] = [
                {
                    flowPath: "flows/off.canvas",
                    roots: [{ nodeId: "a", trigger: { event: "tag.added", enabled: false } }],
                },
            ];
            expect(buildBindings(flows)[0].enabled).toBe(false);
        });
    });

    describe("matchBindings", () => {
        const bindings: WorkflowBinding[] = [
            { event: "note.created", flowPath: "a" },
            { event: "note.modified", flowPath: "b" },
            { event: "note.created", flowPath: "c", enabled: false },
            { event: "note.created", flowPath: "d", enabled: true },
        ];

        it("returns bindings whose event matches and are not explicitly disabled", () => {
            const matched = matchBindings("note.created", bindings).map((b) => b.flowPath);
            expect(matched).toEqual(["a", "d"]);
        });

        it("returns nothing when no binding matches the event", () => {
            expect(matchBindings("property.changed", bindings)).toEqual([]);
        });
    });
});

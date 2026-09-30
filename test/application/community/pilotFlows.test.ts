import { describe, it, expect } from "@jest/globals";
import { join } from "path";
import { validateSystemTemplate, REGISTERED_ACTION_IDS } from "application/community/systemInstall";
import { templateGraph } from "application/community/templateGraph";
import { startRehearsal } from "application/notes/rehearsal";
import { stepCanvasColor } from "zettelkasten/phases/phaseColor";
import { PHASE_CANVAS_COLOR } from "zettelkasten/phases/phaseColor";
import type { StepPhase } from "zettelkasten/phases/phases";
import {
    loadPilot,
    shapeProblems,
    mechanicalOnCreationProblems,
    aiProblems,
    edgeCount,
    inlineSteps,
} from "./pilotShape";

/**
 * The pilot systems are drawn flows, not skeletal boxes (#612, Slice B).
 *
 * This is the shared harness the three rebuilt pilots (Zettelkasten/PARA/GTD) run through as each
 * lands (Slices C–E add its ref to `PILOTS`). Slice B proves the harness itself against the reference
 * fixture — the documented inline-flow pattern: one capture root branching to two phased outcomes,
 * drawn with edges + exits, mechanical-only on-creation.
 */
const FIXTURES = join(__dirname, "fixtures");
const SYSTEMS = join(__dirname, "..", "..", "..", "docs", "systems");

// Grows as the pilots land: Slice C adds zettelkasten-v2, D adds para-v2, E adds gtd.
const PILOTS: string[] = [
    join(FIXTURES, "reference-flow.zftemplate"),
    join(SYSTEMS, "zettelkasten-v2.zftemplate"),
    join(SYSTEMS, "para-v2.zftemplate"),
    join(SYSTEMS, "gtd.zftemplate"),
];

describe("the inline-flow pilot pattern (#612)", () => {
    for (const file of PILOTS) {
        describe(file.split(/[/\\]/).pop() ?? file, () => {
            const template = loadPilot(file);

            it("is a valid, inline-linted system (Slice A guardrail)", () => {
                expect(validateSystemTemplate(template, REGISTERED_ACTION_IDS)).toEqual([]);
            });

            it("draws a flow: edges, inline steps, exactly one root", () => {
                expect(shapeProblems(template)).toEqual([]);
                expect(edgeCount(template)).toBeGreaterThan(0);
                expect(inlineSteps(template).length).toBeGreaterThan(1);
            });

            it("auto-writes only mechanical outputs on creation (§XII)", () => {
                expect(mechanicalOnCreationProblems(template)).toEqual([]);
            });

            it("carries no AI-category action (offline)", () => {
                expect(aiProblems(template)).toEqual([]);
            });

            it("colours every step by its phase (AC-3)", () => {
                const nodes = JSON.parse(template.canvas.content).nodes as { id: string; color?: string; zettelflowConfig?: string }[];
                for (const node of nodes) {
                    if (typeof node.zettelflowConfig !== "string") continue;
                    const phase = (JSON.parse(node.zettelflowConfig) as { phase?: StepPhase }).phase;
                    if (!phase) continue;
                    expect({ id: node.id, colour: stepCanvasColor(node.color, phase) }).toEqual({
                        id: node.id,
                        colour: PHASE_CANVAS_COLOR[phase],
                    });
                }
            });
        });
    }
});

describe("Zettelkasten v2 — the origin branch routes to one outcome (#612, Slice C)", () => {
    const template = loadPilot(join(SYSTEMS, "zettelkasten-v2.zftemplate"));
    const graph = templateGraph(template, (yaml: string) => JSON.parse(yaml));
    const stateFor = (origin: string) =>
        startRehearsal(graph.rehearsal, { frontmatter: { origin }, noteTitle: "", canvasName: "" });

    it("walks from the single capture root", () => {
        expect(graph.rehearsal.steps.filter((step) => step.root)).toHaveLength(1);
        expect(graph.rehearsal.steps.find((step) => step.root)?.label).toBe("Capture a Zettel");
    });

    it("opens exactly the chosen maturity, closing the other two", () => {
        for (const [origin, outcome] of [
            ["fleeting", "Fleeting note"],
            ["source", "Literature note"],
            ["idea", "Permanent note"],
        ] as const) {
            const state = stateFor(origin);
            expect({ origin, open: state?.options.map((o) => o.label), closed: state?.closed.length }).toEqual({
                origin,
                open: [outcome],
                closed: 2,
            });
        }
    });
});

describe("PARA v2 — the classify branch files into one category (#612, Slice D)", () => {
    const template = loadPilot(join(SYSTEMS, "para-v2.zftemplate"));
    const graph = templateGraph(template, (yaml: string) => JSON.parse(yaml));
    const stateFor = (para: string) =>
        startRehearsal(graph.rehearsal, { frontmatter: { para }, noteTitle: "", canvasName: "" });

    it("walks from the single classify root", () => {
        expect(graph.rehearsal.steps.filter((step) => step.root)).toHaveLength(1);
        expect(graph.rehearsal.steps.find((step) => step.root)?.label).toBe("Classify");
    });

    it("opens exactly the chosen category, closing the other three", () => {
        for (const [para, outcome] of [
            ["project", "Project"],
            ["area", "Area"],
            ["resource", "Resource"],
            ["archive", "Archive"],
        ] as const) {
            const state = stateFor(para);
            expect({ para, open: state?.options.map((o) => o.label), closed: state?.closed.length }).toEqual({
                para,
                open: [outcome],
                closed: 3,
            });
        }
    });
});

describe("GTD — clarify branches to one disposition (#612, Slice E)", () => {
    const template = loadPilot(join(SYSTEMS, "gtd.zftemplate"));
    const graph = templateGraph(template, (yaml: string) => JSON.parse(yaml));
    const stateFor = (disposition: string) =>
        startRehearsal(graph.rehearsal, { frontmatter: { disposition }, noteTitle: "", canvasName: "" });

    it("walks from the single capture root", () => {
        expect(graph.rehearsal.steps.filter((step) => step.root)).toHaveLength(1);
        expect(graph.rehearsal.steps.find((step) => step.root)?.label).toBe("Capture & clarify");
    });

    it("opens exactly the chosen disposition, closing the other two", () => {
        for (const [disposition, outcome] of [
            ["next", "Next action"],
            ["project", "Project"],
            ["reference", "Reference / someday"],
        ] as const) {
            const state = stateFor(disposition);
            expect({ disposition, open: state?.options.map((o) => o.label), closed: state?.closed.length }).toEqual({
                disposition,
                open: [outcome],
                closed: 2,
            });
        }
    });
});

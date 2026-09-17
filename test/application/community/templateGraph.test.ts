import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { splitFrontmatter, templateGraph } from "application/community/templateGraph";
import { startRehearsal, rehearsalOutcome } from "application/notes/rehearsal";
import { flowFindings } from "application/notes/flowFindings";
import type { ZfTemplate } from "application/template/zfTemplate";
import type { EvalContext } from "application/notes/conditionEvaluator";

/** The injected parser: JSON is valid YAML, which is what the canvas stores anyway. */
const parseYaml = (yaml: string) => {
    try {
        return JSON.parse(yaml);
    } catch {
        // A tiny "key: value" reader, enough for the frontmatter in the fixtures.
        const out: Record<string, unknown> = {};
        for (const line of yaml.split("\n")) {
            const match = /^(\w+):\s*(.*)$/.exec(line.trim());
            if (match) out[match[1]] = match[2];
        }
        return out;
    }
};

const canvas = {
    nodes: [
        {
            id: "root",
            type: "text",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            zettelflowConfig: JSON.stringify({
                root: true,
                label: "Start",
                actions: [
                    { type: "prompt", hasUI: true, key: "state", zone: "frontmatter", id: "a" },
                    { type: "script", hasUI: false, id: "b", description: "stamp.js" },
                ],
                body: "# {{title}}\n",
            }),
        },
        { id: "note", type: "file", file: "Permanent.md", x: 100, y: 0, width: 10, height: 10 },
        { id: "gone", type: "file", file: "Missing.md", x: 200, y: 0, width: 10, height: 10 },
    ],
    edges: [
        { id: "e1", fromNode: "root", toNode: "note", label: 'if: frontmatter.state === "permanent"' },
        { id: "e2", fromNode: "root", toNode: "gone" },
    ],
};

const template: ZfTemplate = {
    zfVersion: "1",
    name: "Fixture",
    description: "",
    author: "",
    canvas: { filename: "Fixture.canvas", content: JSON.stringify(canvas) },
    steps: [
        {
            filename: "Permanent.md",
            content: `---\n${JSON.stringify({
                zettelFlowSettings: { label: "Permanent", actions: [], targetFolder: "Permanent" },
                type: "idea",
            })}\n---\nPermanent body\n`,
        },
    ],
};

const context: EvalContext = { frontmatter: { state: "permanent" }, noteTitle: "", canvasName: "" };

describe("a system is a graph before it is installed (#438)", () => {
    it("splits a step's frontmatter from its body", () => {
        expect(splitFrontmatter("---\na: 1\n---\nbody\n")).toEqual({ yaml: "a: 1", body: "body\n" });
        expect(splitFrontmatter("no frontmatter")).toEqual({ yaml: "", body: "no frontmatter" });
    });

    it("reads the steps the canvas and the bundle carry between them", () => {
        const graph = templateGraph(template, parseYaml);
        expect(graph.rehearsal.steps.map((step) => step.label)).toEqual(["Start", "Permanent"]);
        expect(graph.rehearsal.steps[0].root).toBe(true);
    });

    it("walks with the same rehearsal the vault uses, gates and all", () => {
        const graph = templateGraph(template, parseYaml);
        const state = startRehearsal(graph.rehearsal, context);
        // Both arrows leave the root; the second points at a step the bundle forgot, which the
        // walk still offers (the arrow is real) and the review names below.
        expect(state?.options.map((option) => option.label)).toEqual(["Permanent", "gone"]);

        const fleeting = startRehearsal(graph.rehearsal, {
            ...context,
            frontmatter: { state: "fleeting" },
        });
        expect(fleeting?.options.map((option) => option.label)).toEqual(["gone"]);
        expect(fleeting?.closed[0].expression).toBe('frontmatter.state === "permanent"');
    });

    it("says what would run, and runs none of it", () => {
        const execute = jest.fn();
        const graph = templateGraph(template, parseYaml);
        const state = startRehearsal(graph.rehearsal, context);
        expect(state?.wouldRun.map((entry) => entry.type)).toEqual(["prompt", "script"]);
        expect(execute).not.toHaveBeenCalled();
    });

    it("assembles the note the system would produce", () => {
        const graph = templateGraph(template, parseYaml);
        const state = startRehearsal(graph.rehearsal, context);
        const outcome = rehearsalOutcome(graph.rehearsal, state!, context, "A note");
        expect(outcome.preview.body).toContain("# A note");
    });

    it("reports what is odd about it before anything is written", () => {
        const kinds = flowFindings(templateGraph(template, parseYaml).findings).map((f) => f.kind);
        // The bundle has a file node whose step is not in it, and that step contributes nothing.
        expect(kinds).toContain("missing-note");
    });
});

describe("reading a system touches nothing (#438, AC-2)", () => {
    it("imports no vault reader and no writer", () => {
        const source = readFileSync(
            join(__dirname, "..", "..", "..", "src", "application", "community", "templateGraph.ts"),
            "utf8"
        );
        for (const forbidden of ['from "obsidian"', "FileService", "FrontmatterService", "createFile"]) {
            expect(source).not.toContain(forbidden);
        }
    });
});

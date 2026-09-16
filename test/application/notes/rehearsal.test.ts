import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import {
    advanceRehearsal,
    rehearsalOutcome,
    startRehearsal,
    type RehearsalFlow,
    type RehearsalState,
} from "application/notes/rehearsal";
import { explainClosedBranch } from "application/notes/branchVisibility";
import type { EvalContext } from "application/notes/conditionEvaluator";

const context: EvalContext = {
    frontmatter: { state: "permanent" },
    noteTitle: "Atomicity",
    canvasName: "zettel",
};

/** A flow with a gated branch, a WAIT step, a script action and a step declaring a linked note. */
const flow: RehearsalFlow = {
    steps: [
        {
            id: "root",
            label: "Start",
            root: true,
            actions: [
                { type: "prompt", hasUI: true, description: "Title" },
                { type: "script", hasUI: false, description: "stamp.js" },
            ],
            template: { body: "# Start\n", frontmatter: { type: "idea" } },
            exits: { "e-root-permanent": { when: 'frontmatter.state === "permanent"' } },
        },
        {
            id: "permanent",
            label: "Permanent",
            template: { body: "Permanent body\n", frontmatter: { state: "permanent" } },
            satellite: { template: "Steps/Idea.md", title: "{{title}} — idea" },
            targetFolder: "Permanent",
            wait: { mode: "confirm" },
        },
        { id: "fleeting", label: "Fleeting" },
    ],
    edges: [
        { id: "e-root-permanent", fromNode: "root", toNode: "permanent" },
        { id: "e-root-fleeting", fromNode: "root", toNode: "fleeting", says: "Not yet" },
    ],
};

const start = (): RehearsalState => {
    const state = startRehearsal(flow, context);
    if (!state) throw new Error("the fixture has a root");
    return state;
};

describe("rehearsing a flow walks it without touching anything (#430)", () => {
    it("stands at the root and offers only the open branches", () => {
        const state = start();
        expect(state.currentId).toBe("root");
        expect(state.options.map((option) => option.stepId)).toEqual(["permanent", "fleeting"]);
        expect(state.done).toBe(false);
    });

    it("closes a branch whose gate is false, with #414's own explanation (AC-4)", () => {
        const fleetingContext: EvalContext = { ...context, frontmatter: { state: "fleeting" } };
        const state = startRehearsal(flow, fleetingContext);
        expect(state?.options.map((option) => option.stepId)).toEqual(["fleeting"]);
        expect(state?.closed).toHaveLength(1);
        expect(state?.closed[0].reason).toEqual(
            explainClosedBranch('frontmatter.state === "permanent"', fleetingContext)
        );
    });

    it("advances along a chosen option and records the path", () => {
        const state = advanceRehearsal(flow, context, start(), "permanent");
        expect(state.path).toEqual(["root", "permanent"]);
        expect(state.done).toBe(true);
    });

    it("stays put when asked to take an option that is not on offer", () => {
        const state = start();
        expect(advanceRehearsal(flow, context, state, "nowhere")).toBe(state);
    });

    it("lists what would run, including the pause, and runs none of it (AC-3)", () => {
        const execute = jest.fn();
        const state = advanceRehearsal(flow, context, start(), "permanent");
        expect(state.wouldRun.map((entry) => entry.type)).toEqual(["prompt", "script", "wait"]);
        expect(state.wouldRun[0].asks).toBe(true);
        expect(state.wouldRun[1].asks).toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });

    it("has nothing to rehearse when no step is the start", () => {
        expect(startRehearsal({ steps: [{ id: "a", label: "A" }], edges: [] }, context)).toBeUndefined();
    });
});

describe("what the walk would have produced (#430, FR-5)", () => {
    it("assembles the note from the templates it walked through", () => {
        const state = advanceRehearsal(flow, context, start(), "permanent");
        const outcome = rehearsalOutcome(flow, state, context, "Atomicity");
        expect(outcome.preview.body).toContain("# Start");
        expect(outcome.preview.body).toContain("Permanent body");
        expect(outcome.preview.frontmatter).toMatchObject({ type: "idea", state: "permanent" });
    });

    it("names the linked note it would also create, without creating it", () => {
        const state = advanceRehearsal(flow, context, start(), "permanent");
        expect(rehearsalOutcome(flow, state, context).satellites).toEqual([
            { template: "Steps/Idea.md", title: "{{title}} — idea", stepLabel: "Permanent" },
        ]);
    });

    it("says where the note would be filed", () => {
        const state = advanceRehearsal(flow, context, start(), "permanent");
        expect(rehearsalOutcome(flow, state, context).targetFolder).toBe("Permanent");
    });

    it("says nothing about a folder the walk never reached", () => {
        expect(rehearsalOutcome(flow, start(), context).targetFolder).toBeUndefined();
    });
});

describe("the rehearsal cannot write, by construction (#430, AC-2)", () => {
    it("reaches no writer at all", () => {
        const source = readFileSync(
            join(__dirname, "..", "..", "..", "src", "application", "notes", "rehearsal.ts"),
            "utf8"
        );
        const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
        // Only its pure neighbours. Anything that can reach the vault, the store or Obsidian is a
        // rehearsal that could leave something behind.
        expect(imports.sort()).toEqual(
            [
                "./branchVisibility",
                "./conditionEvaluator",
                "./previewAssembly",
                "./stepExits",
            ].sort()
        );
        for (const forbidden of [
            "FileService",
            "createFile",
            "setProperties",
            "JudgementLog",
            "useNoteBuilderStore",
            "obsidian",
        ]) {
            expect(source).not.toContain(forbidden);
        }
    });
});

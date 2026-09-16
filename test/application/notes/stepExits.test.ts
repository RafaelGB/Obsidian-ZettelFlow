import { describe, it, expect } from "@jest/globals";
import {
    ExitCandidate,
    StepExits,
    moveExit,
    planMigration,
    pruneExits,
    resolveExits,
    setDefaultExit,
} from "application/notes/stepExits";
import type { EvalContext } from "application/notes/conditionEvaluator";

const context: EvalContext = {
    frontmatter: { state: "permanent", type: "idea" },
    noteTitle: "Atomicity",
    canvasName: "zettel",
};

const child = (id: string, label: string, tooltip?: string, edgeId = `e-${id}`): ExitCandidate => ({
    id,
    label,
    tooltip,
    edgeId,
});

describe("a flow with no exit configuration behaves exactly as before (#427, AC-2)", () => {
    it("reads the gate from the label, as the wizard always did", () => {
        const resolved = resolveExits(
            [
                child("a", "Permanent", 'if: frontmatter.state === "permanent"'),
                child("b", "Fleeting", 'if: frontmatter.state === "fleeting"'),
            ],
            {},
            context
        );
        expect(resolved.map((exit) => exit.open)).toEqual([true, false]);
        expect(resolved[1].expression).toBe('frontmatter.state === "fleeting"');
    });

    it("reads the description from the label, and never shows a bare gate", () => {
        const resolved = resolveExits(
            [child("a", "Source", "Es algo que he leído"), child("b", "Idea", "if: true")],
            {},
            context
        );
        expect(resolved[0].says).toBe("Es algo que he leído");
        expect(resolved[1].says).toBeUndefined();
    });

    it("keeps canvas order", () => {
        const resolved = resolveExits([child("a", "A"), child("b", "B"), child("c", "C")], {}, context);
        expect(resolved.map((exit) => exit.candidate.id)).toEqual(["a", "b", "c"]);
    });

    it("safe-opens a malformed gate and says so, as #119 does", () => {
        const resolved = resolveExits([child("x", "Broken", "if: frontmatter.state ===")], {}, context);
        expect(resolved[0].open).toBe(true);
        expect(resolved[0].invalid).toBe(true);
    });
});

describe("configuration takes over, field by field (#427)", () => {
    it("says what the step declares, not what the label says", () => {
        const exits: StepExits = { "e-a": { says: "Something I read" } };
        const resolved = resolveExits([child("a", "Source", "if: true")], exits, context);
        expect(resolved[0].says).toBe("Something I read");
    });

    it("gates on the declared condition", () => {
        const exits: StepExits = { "e-a": { when: 'frontmatter.state === "fleeting"' } };
        expect(resolveExits([child("a", "A")], exits, context)[0].open).toBe(false);
    });

    it("treats a blank condition as always open", () => {
        const exits: StepExits = { "e-a": { when: "   " } };
        expect(resolveExits([child("a", "A")], exits, context)[0].open).toBe(true);
    });

    it("orders declared exits first, leaving the rest in canvas order behind them", () => {
        const exits: StepExits = { "e-c": { order: 1 }, "e-a": { order: 2 } };
        const resolved = resolveExits(
            [child("a", "A"), child("b", "B"), child("c", "C")],
            exits,
            context
        );
        expect(resolved.map((exit) => exit.candidate.id)).toEqual(["c", "a", "b"]);
    });

    it("marks the default", () => {
        const exits: StepExits = { "e-b": { default: true } };
        const resolved = resolveExits([child("a", "A"), child("b", "B")], exits, context);
        expect(resolved.map((exit) => exit.isDefault)).toEqual([false, true]);
    });

    it("ignores an exit whose edge is not among the children", () => {
        const exits: StepExits = { "e-ghost": { says: "Gone" } };
        const resolved = resolveExits([child("a", "A", "Real")], exits, context);
        expect(resolved).toHaveLength(1);
        expect(resolved[0].says).toBe("Real");
    });

    it("falls back to the label for a child that arrived without an edge (a group child)", () => {
        const candidate: ExitCandidate = { id: "g", label: "Inside", edgeId: undefined };
        expect(resolveExits([candidate], {}, context)[0].open).toBe(true);
    });
});

describe("one default, and no orphans (#427)", () => {
    it("clears the previous default when a new one is set", () => {
        const exits = setDefaultExit({ "e-a": { default: true }, "e-b": { says: "B" } }, "e-b");
        expect(exits["e-a"].default).toBeUndefined();
        expect(exits["e-b"]).toEqual({ says: "B", default: true });
    });

    it("can mark an edge that had no configuration yet", () => {
        expect(setDefaultExit({}, "e-new")).toEqual({ "e-new": { default: true } });
    });

    it("drops an exit whose arrow was deleted", () => {
        expect(pruneExits({ "e-a": { says: "A" }, "e-gone": { says: "G" } }, ["e-a"])).toEqual({
            "e-a": { says: "A" },
        });
    });
});

describe("migration moves the label into the step, once (#427, AC-3)", () => {
    it("moves a leading gate into the step and leaves the label empty", () => {
        const plan = planMigration([child("a", "A", 'if: frontmatter.type === "source"')], {});
        expect(plan).toEqual([
            {
                edgeId: "e-a",
                label: "",
                exit: { when: 'frontmatter.type === "source"' },
            },
        ]);
    });

    it("carries a plain label across as the option text, gate-free", () => {
        // A label whose "if:" is not at the start was never a gate, so migrating it as one would
        // start closing a branch that had always been open. It moves as text.
        const plan = planMigration([child("a", "A", 'Fuente — if: x === 1')], {});
        expect(plan).toEqual([
            { edgeId: "e-a", label: 'Fuente — if: x === 1', exit: { says: 'Fuente — if: x === 1' } },
        ]);
    });

    it("empties a label that was only a gate", () => {
        const plan = planMigration([child("a", "A", 'if: frontmatter.state === "fleeting"')], {});
        expect(plan[0].label).toBe("");
        expect(plan[0].exit).toEqual({ when: 'frontmatter.state === "fleeting"' });
    });

    it("is idempotent: an already-configured edge proposes nothing", () => {
        const exits: StepExits = { "e-a": { says: "Fuente" } };
        expect(planMigration([child("a", "A", "if: true")], exits)).toEqual([]);
    });

    it("proposes nothing for an edge with no label at all", () => {
        expect(planMigration([child("a", "A")], {})).toEqual([]);
    });
});

describe("moving an exit settles the whole order (#427)", () => {
    const three = [child("a", "A"), child("b", "B"), child("c", "C")];

    it("numbers every exit, not just the one that moved", () => {
        // Half an order is an arrangement nobody can predict from the editor.
        expect(moveExit(three, {}, "e-c", -1)).toEqual({
            "e-a": { order: 1 },
            "e-c": { order: 2 },
            "e-b": { order: 3 },
        });
    });

    it("keeps everything else each exit says", () => {
        const exits: StepExits = { "e-a": { says: "First", default: true } };
        expect(moveExit(three, exits, "e-a", 1)["e-a"]).toEqual({
            says: "First",
            default: true,
            order: 2,
        });
    });

    it("refuses to move past either end, rather than silently doing nothing else", () => {
        const exits: StepExits = { "e-b": { says: "B" } };
        expect(moveExit(three, exits, "e-a", -1)).toBe(exits);
        expect(moveExit(three, exits, "e-c", 1)).toBe(exits);
        expect(moveExit(three, exits, "e-ghost", 1)).toBe(exits);
    });

    it("moves within the order already declared", () => {
        const exits: StepExits = { "e-c": { order: 1 }, "e-a": { order: 2 }, "e-b": { order: 3 } };
        const moved = moveExit(three, exits, "e-a", -1);
        expect([moved["e-a"].order, moved["e-c"].order, moved["e-b"].order]).toEqual([1, 2, 3]);
    });
});

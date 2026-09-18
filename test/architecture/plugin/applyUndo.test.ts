import { describe, it, expect } from "@jest/globals";
import { applyUndo, type UndoVault } from "architecture/plugin/writes/applyUndo";
import type { UndoPlan } from "application/writes/undoPlan";

function emptyPlan(overrides: Partial<UndoPlan> = {}): UndoPlan {
    return {
        trash: [],
        restore: [],
        moveBack: [],
        unappend: [],
        blocked: [],
        possible: true,
        ...overrides,
    };
}

function vault() {
    const done: string[] = [];
    const port: UndoVault = {
        trash: async (path) => {
            done.push(`trash:${path}`);
        },
        restore: async (path, before) => {
            done.push(`restore:${path}:${Object.keys(before).join(",")}`);
        },
        move: async (from, to) => {
            done.push(`move:${from}->${to}`);
        },
        unappend: async (path, text) => {
            done.push(`unappend:${path}:${text}`);
        },
    };
    return { port, done };
}

describe("applying an undo (#454)", () => {
    it("trashes what was created and puts the properties back", async () => {
        const { port, done } = vault();
        const outcome = await applyUndo(
            emptyPlan({
                trash: ["Notes/one.md", "Notes/one.satellite.md"],
                restore: [{ path: "Notes/one.md", before: { status: undefined, tags: ["old"] } }],
            }),
            port
        );
        // Properties first: a note about to go to the trash does not need its frontmatter fixed,
        // but a note that is only having properties restored does.
        expect(done).toEqual([
            "restore:Notes/one.md:status,tags",
            "trash:Notes/one.md",
            "trash:Notes/one.satellite.md",
        ]);
        expect(outcome).toEqual({ done: 3, failed: [] });
    });

    it("moves a file back where it came from", async () => {
        const { port, done } = vault();
        await applyUndo(emptyPlan({ moveBack: [{ from: "flows/a.canvas", to: "a.canvas" }] }), port);
        expect(done).toEqual(["move:flows/a.canvas->a.canvas"]);
    });

    it("removes the text it appended", async () => {
        const { port, done } = vault();
        await applyUndo(emptyPlan({ unappend: [{ path: "a.md", text: "[[A]]" }] }), port);
        expect(done).toEqual(["unappend:a.md:[[A]]"]);
    });

    it("does nothing at all for a plan with nothing in it", async () => {
        const { port, done } = vault();
        const outcome = await applyUndo(emptyPlan({ possible: false }), port);
        expect(done).toEqual([]);
        expect(outcome.done).toBe(0);
    });

    it("keeps going when one step fails, and names it", async () => {
        const { port, done } = vault();
        const failing: UndoVault = {
            ...port,
            trash: async (path) => {
                if (path === "Notes/one.md") throw new Error("locked");
                done.push(`trash:${path}`);
            },
        };
        const outcome = await applyUndo(
            emptyPlan({ trash: ["Notes/one.md", "Notes/two.md"] }),
            failing
        );
        expect(done).toEqual(["trash:Notes/two.md"]);
        expect(outcome.failed).toEqual(["Notes/one.md"]);
        expect(outcome.done).toBe(1);
    });

    it("never touches what the plan set aside", async () => {
        const { port, done } = vault();
        await applyUndo(
            emptyPlan({
                trash: ["Notes/ok.md"],
                blocked: [{ path: "Notes/edited.md", reason: "changed", changedAt: 1 }],
                possible: false,
            }),
            port
        );
        // A blocked path is not in `trash`; applying a partial plan is the caller's decision and
        // the applier simply does what it was handed.
        expect(done).toEqual(["trash:Notes/ok.md"]);
    });
});

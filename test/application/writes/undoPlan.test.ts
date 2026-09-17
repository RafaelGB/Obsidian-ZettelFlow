import { describe, it, expect } from "@jest/globals";
import {
    CHANGED_GRACE_MS,
    planUndo,
    undoSummary,
    type VaultFacts,
} from "application/writes/undoPlan";
import type { VaultWrite } from "application/writes/vaultWriteLog";

const NOW = 1_700_000_000_000;

function write(overrides: Partial<VaultWrite> = {}): VaultWrite {
    return {
        id: overrides.id ?? "w1",
        batch: overrides.batch ?? "b1",
        at: overrides.at ?? NOW,
        kind: overrides.kind ?? "note-created",
        path: overrides.path ?? "Notes/one.md",
        origin: overrides.origin ?? { kind: "flow", ref: "flows/create.canvas" },
        ...overrides,
    };
}

/** A vault where nothing has been touched since ZettelFlow wrote it. */
function untouched(writes: VaultWrite[]): VaultFacts {
    const mtimes: Record<string, number> = {};
    for (const entry of writes) mtimes[entry.path] = entry.at;
    return { mtimes };
}

describe("planning an undo, before anything moves (#454)", () => {
    const flowBatch = [
        write({ id: "a", kind: "note-created", path: "Notes/one.md", at: NOW }),
        write({ id: "b", kind: "note-created", path: "Notes/one.satellite.md", at: NOW + 10 }),
        write({
            id: "c",
            kind: "properties-set",
            path: "Notes/one.md",
            at: NOW + 20,
            before: { status: undefined, tags: ["old"] },
            after: { status: "seed", tags: ["new"] },
        }),
    ];

    it("takes a note, its satellite and its properties back as one thing", () => {
        const plan = planUndo(flowBatch, untouched(flowBatch));
        expect(plan.trash).toEqual(["Notes/one.md", "Notes/one.satellite.md"]);
        expect(plan.restore).toEqual([
            { path: "Notes/one.md", before: { status: undefined, tags: ["old"] } },
        ]);
        expect(plan.blocked).toEqual([]);
        expect(plan.possible).toBe(true);
    });

    it("counts what it will do, so the preview can say it before it happens", () => {
        expect(undoSummary(planUndo(flowBatch, untouched(flowBatch)))).toEqual({
            notes: 2,
            properties: 2,
            moves: 0,
            appends: 0,
            blocked: 0,
        });
    });

    it("moves a file back to where it came from", () => {
        const moved = [
            write({ kind: "file-moved", path: "_ZettelFlow/flows/a.canvas", from: "a.canvas" }),
        ];
        const plan = planUndo(moved, untouched(moved));
        expect(plan.moveBack).toEqual([{ from: "_ZettelFlow/flows/a.canvas", to: "a.canvas" }]);
    });

    it("removes exactly the text it appended, and nothing around it", () => {
        const appended = [write({ kind: "content-appended", path: "Notes/one.md", appended: "[[A]]" })];
        const plan = planUndo(appended, untouched(appended));
        expect(plan.unappend).toEqual([{ path: "Notes/one.md", text: "[[A]]" }]);
    });

    it("plans nothing for a batch already taken back", () => {
        const done = flowBatch.map((entry) => ({ ...entry, undone: NOW + 100 }));
        const plan = planUndo(done, untouched(done));
        expect(plan.trash).toEqual([]);
        expect(plan.restore).toEqual([]);
        expect(plan.possible).toBe(false);
    });

    it("skips a file that is already gone rather than calling it a problem", () => {
        const plan = planUndo(flowBatch, { mtimes: { "Notes/one.satellite.md": NOW + 10 } });
        expect(plan.trash).toEqual(["Notes/one.satellite.md"]);
        expect(plan.blocked).toEqual([]);
    });

    it("refuses a note edited after ZettelFlow last touched it, and says which", () => {
        const facts = untouched(flowBatch);
        facts.mtimes["Notes/one.md"] = NOW + 20 + CHANGED_GRACE_MS + 1;
        const plan = planUndo(flowBatch, facts);
        expect(plan.blocked).toEqual([
            { path: "Notes/one.md", reason: "changed", changedAt: NOW + 20 + CHANGED_GRACE_MS + 1 },
        ]);
        expect(plan.trash).toEqual(["Notes/one.satellite.md"]);
        expect(plan.possible).toBe(false);
    });

    it("allows for the lag between a write and the mtime it lands with", () => {
        const facts = untouched(flowBatch);
        facts.mtimes["Notes/one.md"] = NOW + 20 + CHANGED_GRACE_MS;
        expect(planUndo(flowBatch, facts).blocked).toEqual([]);
    });

    it("compares against the last time ZettelFlow itself touched the note, not the first", () => {
        // Creating a note and then setting its frontmatter bumps the mtime; a batch must not block
        // itself on its own later writes.
        const facts = { mtimes: { "Notes/one.md": NOW + 20, "Notes/one.satellite.md": NOW + 10 } };
        expect(planUndo(flowBatch, facts).blocked).toEqual([]);
    });

    it("refuses a property somebody else has since changed", () => {
        const facts: VaultFacts = {
            ...untouched(flowBatch),
            frontmatter: { "Notes/one.md": { status: "grown", tags: ["new"] } },
        };
        const plan = planUndo(flowBatch, facts);
        expect(plan.restore).toEqual([]);
        expect(plan.blocked).toEqual([{ path: "Notes/one.md", reason: "property-changed", key: "status" }]);
    });

    it("restores when the properties still hold what ZettelFlow left", () => {
        const facts: VaultFacts = {
            ...untouched(flowBatch),
            frontmatter: { "Notes/one.md": { status: "seed", tags: ["new"] } },
        };
        expect(planUndo(flowBatch, facts).restore).toHaveLength(1);
    });

    it("says an overwrite cannot be taken back, rather than pretending", () => {
        const overwrite = [write({ kind: "content-replaced", path: "Notes/one.md" })];
        const plan = planUndo(overwrite, untouched(overwrite));
        expect(plan.blocked).toEqual([{ path: "Notes/one.md", reason: "not-undoable" }]);
        expect(plan.possible).toBe(false);
    });

    it("offers a partial undo only as what is left when the blocked are set aside", () => {
        const facts = untouched(flowBatch);
        facts.mtimes["Notes/one.md"] = NOW + 1_000_000;
        const plan = planUndo(flowBatch, facts);
        expect(plan.possible).toBe(false);
        // Everything unblocked is still planned, so a partial undo is a decision, not a rebuild.
        expect(plan.trash).toEqual(["Notes/one.satellite.md"]);
        expect(undoSummary(plan).blocked).toBe(1);
    });

    it("plans nothing at all for an empty batch", () => {
        const plan = planUndo([], { mtimes: {} });
        expect(plan.possible).toBe(false);
        expect(undoSummary(plan)).toEqual({ notes: 0, properties: 0, moves: 0, appends: 0, blocked: 0 });
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    CascadeGuard,
    isSelfWrite,
    MAX_CASCADE_DEPTH,
} from "architecture/plugin/events/loopGuard";

describe("loop / cascade guard (AC-5)", () => {
    it("caps re-entry at a bound of one (a workflow's own write fires at most once)", () => {
        expect(MAX_CASCADE_DEPTH).toBe(1);
    });

    describe("isSelfWrite — origin suppression via VaultStateManager state", () => {
        it("is true while the vault is frozen (a ZettelFlow write in progress)", () => {
            expect(isSelfWrite("notes/a.md", { frozen: true })).toBe(true);
        });

        it("is true when the note itself is being processed", () => {
            expect(
                isSelfWrite("notes/a.md", { frozen: false, onProcessPaths: ["notes/a.md"] })
            ).toBe(true);
        });

        it("is false for a genuine user edit (not frozen, not on-process)", () => {
            expect(isSelfWrite("notes/a.md", { frozen: false })).toBe(false);
            expect(
                isSelfWrite("notes/a.md", { frozen: false, onProcessPaths: ["notes/other.md"] })
            ).toBe(false);
        });
    });

    describe("CascadeGuard — bounded depth per note", () => {
        it("allows the first entry and denies re-entry beyond the depth cap", () => {
            const guard = new CascadeGuard();
            expect(guard.allows("notes/a.md")).toBe(true);
            guard.enter("notes/a.md");
            expect(guard.allows("notes/a.md")).toBe(false); // its own write cannot re-enter
        });

        it("allows again after the run exits (cascade terminates)", () => {
            const guard = new CascadeGuard();
            guard.enter("notes/a.md");
            guard.exit("notes/a.md");
            expect(guard.allows("notes/a.md")).toBe(true);
        });

        it("tracks depth independently per note", () => {
            const guard = new CascadeGuard();
            guard.enter("notes/a.md");
            expect(guard.allows("notes/a.md")).toBe(false);
            expect(guard.allows("notes/b.md")).toBe(true);
        });
    });
});

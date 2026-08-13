import { describe, it, expect } from "@jest/globals";
import { evictOldestNotes, DEFAULT_MAX_NOTES } from "architecture/knowledge/timeline/evictOldestNotes";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";

const snap = (at: number): Snapshot[] => [{ at, state: "permanent", claims: [] }];

describe("evictOldestNotes (#168, FR-3, AC-1)", () => {
    it("exposes a default cap of 200 and returns the record unchanged when under it", () => {
        expect(DEFAULT_MAX_NOTES).toBe(200);
        const snapshots = { "a.md": snap(5), "b.md": snap(3) };
        expect(evictOldestNotes(snapshots, 200)).toBe(snapshots);
    });

    it("drops the notes whose most-recent snapshot is oldest until the cap is met", () => {
        const snapshots = { "a.md": snap(5), "b.md": snap(3), "c.md": snap(9) };
        expect(evictOldestNotes(snapshots, 2)).toEqual({ "a.md": snap(5), "c.md": snap(9) });
    });

    it("breaks ties on most-recent time by dropping the larger path", () => {
        const snapshots = { "a.md": snap(5), "b.md": snap(5), "c.md": snap(9) };
        expect(evictOldestNotes(snapshots, 2)).toEqual({ "a.md": snap(5), "c.md": snap(9) });
    });

    it("never mutates the input record", () => {
        const snapshots = { "a.md": snap(5), "b.md": snap(3), "c.md": snap(9) };
        evictOldestNotes(snapshots, 2);
        expect(Object.keys(snapshots).sort()).toEqual(["a.md", "b.md", "c.md"]);
    });
});

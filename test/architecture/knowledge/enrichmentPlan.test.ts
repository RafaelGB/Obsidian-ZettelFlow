import { describe, it, expect } from "@jest/globals";
import {
    fingerprint,
    filesToEnrich,
    rememberEnriched,
    sameFingerprint,
    type FileFingerprint,
} from "architecture/knowledge/index/enrichmentPlan";

function known(entries: [string, number, number][]): Map<string, FileFingerprint> {
    return new Map(entries.map(([path, mtime, size]) => [path, { mtime, size }]));
}

function current(entries: [string, number, number][]): { path: string; mtime: number; size: number }[] {
    return entries.map(([path, mtime, size]) => ({ path, mtime, size }));
}

describe("what actually needs enriching (#459)", () => {
    it("enriches everything the first time, when nothing is known yet", () => {
        const plan = filesToEnrich(new Map(), current([["a.md", 1, 10], ["b.md", 1, 10]]));
        expect(plan.enrich).toEqual(["a.md", "b.md"]);
        expect(plan.drop).toEqual([]);
    });

    it("skips a file that has not moved since the last pass", () => {
        const plan = filesToEnrich(known([["a.md", 1, 10]]), current([["a.md", 1, 10]]));
        expect(plan.enrich).toEqual([]);
    });

    it("includes a file whose modification time changed", () => {
        const plan = filesToEnrich(known([["a.md", 1, 10]]), current([["a.md", 2, 10]]));
        expect(plan.enrich).toEqual(["a.md"]);
    });

    it("includes a file whose size changed even though its time did not", () => {
        // Some sync clients preserve mtime. Size is the second half of the fingerprint precisely
        // so an edit that keeps the timestamp is not invisible.
        const plan = filesToEnrich(known([["a.md", 1, 10]]), current([["a.md", 1, 11]]));
        expect(plan.enrich).toEqual(["a.md"]);
    });

    it("includes a file it has never seen", () => {
        const plan = filesToEnrich(known([["a.md", 1, 10]]), current([["a.md", 1, 10], ["b.md", 1, 10]]));
        expect(plan.enrich).toEqual(["b.md"]);
    });

    it("drops a file that is no longer there", () => {
        const plan = filesToEnrich(known([["a.md", 1, 10], ["gone.md", 1, 10]]), current([["a.md", 1, 10]]));
        expect(plan.drop).toEqual(["gone.md"]);
        expect(plan.enrich).toEqual([]);
    });

    it("plans nothing at all for an empty vault it has already seen empty", () => {
        expect(filesToEnrich(new Map(), [])).toEqual({ enrich: [], drop: [] });
    });

    it("remembers what it enriched, and forgets what it dropped", () => {
        const before = known([["a.md", 1, 10], ["gone.md", 1, 10]]);
        const after = rememberEnriched(
            before,
            current([["a.md", 2, 12], ["b.md", 1, 10]]),
            ["a.md", "b.md"],
            ["gone.md"]
        );
        expect(after.get("a.md")).toEqual({ mtime: 2, size: 12 });
        expect(after.get("b.md")).toEqual({ mtime: 1, size: 10 });
        expect(after.has("gone.md")).toBe(false);
    });

    it("does not remember a file the pass never got to", () => {
        // A cancelled or partial pass must not claim files it skipped, or they stay stale forever.
        const after = rememberEnriched(new Map(), current([["a.md", 1, 10], ["b.md", 1, 10]]), ["a.md"], []);
        expect(after.has("a.md")).toBe(true);
        expect(after.has("b.md")).toBe(false);
    });

    it("compares two fingerprints by value", () => {
        expect(sameFingerprint({ mtime: 1, size: 2 }, { mtime: 1, size: 2 })).toBe(true);
        expect(sameFingerprint({ mtime: 1, size: 2 }, { mtime: 1, size: 3 })).toBe(false);
        expect(sameFingerprint(undefined, { mtime: 1, size: 2 })).toBe(false);
    });

    it("reads a fingerprint off whatever the vault hands it, missing stats included", () => {
        expect(fingerprint({ stat: { mtime: 5, size: 7 } })).toEqual({ mtime: 5, size: 7 });
        // A file with no stat is treated as always changed, rather than as never changed.
        expect(fingerprint({})).toEqual({ mtime: 0, size: -1 });
    });
});

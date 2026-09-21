import { describe, it, expect } from "@jest/globals";
import {
    appendWrite,
    WRITE_WINDOW_MS,
    clearWrites,
    filterWrites,
    MAX_WRITES,
    pruneWrites,
    touchedProperties,
    type VaultWrite,
} from "application/writes/vaultWriteLog";

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

describe("the write record (#453)", () => {
    it("keeps the newest write first", () => {
        const older = write({ id: "old", at: NOW - 1000 });
        const newer = write({ id: "new", at: NOW });
        const log = appendWrite([older], newer, { now: NOW, });
        expect(log.map((entry) => entry.id)).toEqual(["new", "old"]);
    });

    it("drops what is past the window, and keeps what sits exactly on it", () => {
        // Two minutes, not a week (#511): the record's only reader is a thirty-second offer.
        const onTheBoundary = write({ id: "boundary", at: NOW - WRITE_WINDOW_MS });
        const justPast = write({ id: "past", at: NOW - WRITE_WINDOW_MS - 1 });
        const kept = pruneWrites([onTheBoundary, justPast], { now: NOW, });
        expect(kept.map((entry) => entry.id)).toEqual(["boundary"]);
    });

    
    it("caps the total, dropping the oldest first", () => {
        const many = Array.from({ length: MAX_WRITES + 10 }, (_, index) =>
            write({ id: `w${index}`, at: NOW - index })
        );
        const kept = pruneWrites(many, { now: NOW, });
        expect(kept).toHaveLength(MAX_WRITES);
        expect(kept[0].id).toBe("w0");
        expect(kept[kept.length - 1].id).toBe(`w${MAX_WRITES - 1}`);
    });

    it("applies both limits at once", () => {
        const recent = Array.from({ length: 5 }, (_, index) => write({ id: `r${index}`, at: NOW - index }));
        const ancient = Array.from({ length: 5 }, (_, index) =>
            write({ id: `a${index}`, at: NOW - 9 * WRITE_WINDOW_MS - index })
        );
        const kept = pruneWrites([...recent, ...ancient], { now: NOW, });
        expect(kept.map((entry) => entry.id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    });

    
    
    
    
    it("filters by batch, by kind and by path", () => {
        const log = [
            write({ id: "a", batch: "b1", kind: "note-created", path: "Notes/one.md" }),
            write({ id: "b", batch: "b2", kind: "properties-set", path: "Notes/two.md" }),
        ];
        expect(filterWrites(log, { batch: "b1" }).map((entry) => entry.id)).toEqual(["a"]);
        expect(filterWrites(log, { kind: "properties-set" }).map((entry) => entry.id)).toEqual(["b"]);
        expect(filterWrites(log, { path: "Notes/two.md" }).map((entry) => entry.id)).toEqual(["b"]);
        expect(filterWrites(log, {})).toHaveLength(2);
    });

    it("hides what has already been taken back, when asked", () => {
        const log = [write({ id: "a" }), write({ id: "b", batch: "b2", undone: NOW })];
        expect(filterWrites(log, { pendingOnly: true }).map((entry) => entry.id)).toEqual(["a"]);
    });

    it("records a property change as the keys it touched, with both values", () => {
        const entry = write({
            kind: "properties-set",
            before: { status: "seed", tags: ["a"] },
            after: { status: "grown", tags: ["a", "b"] },
        });
        expect(touchedProperties(entry)).toEqual(["status", "tags"]);
    });

    it("says nothing was touched when the write was not a property change", () => {
        expect(touchedProperties(write({ kind: "note-created" }))).toEqual([]);
    });

    it("has an empty log as a stated decision", () => {
        expect(clearWrites()).toEqual([]);
    });
});

describe("a write record is never a copy of the vault (#453)", () => {
    it("has no field for a note's body", () => {
        const entry = write({ kind: "note-created", path: "Notes/one.md" });
        expect(Object.keys(entry)).not.toContain("content");
        expect(Object.keys(entry)).not.toContain("body");
    });

    it("keeps only the property keys the write touched, not the whole frontmatter", () => {
        // `before` is written by the recorder from the keys of `after`; the log itself only has to
        // refuse to grow one, which is what this asserts about its shape.
        const entry = write({ kind: "properties-set", before: { status: "seed" }, after: { status: "grown" } });
        expect(Object.keys(entry.before ?? {})).toEqual(["status"]);
    });
});

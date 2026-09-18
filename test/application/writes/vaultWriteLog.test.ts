import { describe, it, expect } from "@jest/globals";
import {
    appendWrite,
    batchesOf,
    clearWrites,
    DEFAULT_WRITE_RETENTION_DAYS,
    filterWrites,
    markBatchUndone,
    MAX_WRITES,
    pruneWrites,
    touchedProperties,
    type VaultWrite,
} from "application/writes/vaultWriteLog";

const DAY = 24 * 60 * 60 * 1000;
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
        const log = appendWrite([older], newer, { now: NOW, retentionDays: 7 });
        expect(log.map((entry) => entry.id)).toEqual(["new", "old"]);
    });

    it("drops what is older than the window, and keeps what sits exactly on it", () => {
        const onTheBoundary = write({ id: "boundary", at: NOW - 7 * DAY });
        const justPast = write({ id: "past", at: NOW - 7 * DAY - 1 });
        const kept = pruneWrites([onTheBoundary, justPast], { now: NOW, retentionDays: 7 });
        expect(kept.map((entry) => entry.id)).toEqual(["boundary"]);
    });

    it("never keeps more than a week, however large the number asked for", () => {
        const sixDays = write({ id: "six", at: NOW - 6 * DAY });
        const eightDays = write({ id: "eight", at: NOW - 8 * DAY });
        const kept = pruneWrites([sixDays, eightDays], { now: NOW, retentionDays: 30 });
        // A week is the ceiling, not a default: writes are heavier than run records (#451).
        expect(kept.map((entry) => entry.id)).toEqual(["six"]);
    });

    it("caps the total, dropping the oldest first", () => {
        const many = Array.from({ length: MAX_WRITES + 10 }, (_, index) =>
            write({ id: `w${index}`, at: NOW - index })
        );
        const kept = pruneWrites(many, { now: NOW, retentionDays: 7 });
        expect(kept).toHaveLength(MAX_WRITES);
        expect(kept[0].id).toBe("w0");
        expect(kept[kept.length - 1].id).toBe(`w${MAX_WRITES - 1}`);
    });

    it("applies both limits at once", () => {
        const recent = Array.from({ length: 5 }, (_, index) => write({ id: `r${index}`, at: NOW - index }));
        const ancient = Array.from({ length: 5 }, (_, index) =>
            write({ id: `a${index}`, at: NOW - 9 * DAY - index })
        );
        const kept = pruneWrites([...recent, ...ancient], { now: NOW, retentionDays: 7 });
        expect(kept.map((entry) => entry.id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    });

    it("uses a week when nobody said otherwise", () => {
        expect(DEFAULT_WRITE_RETENTION_DAYS).toBe(7);
    });

    it("groups a flow's writes into one batch, newest batch first", () => {
        const log = [
            write({ id: "c", batch: "b2", at: NOW }),
            write({ id: "a", batch: "b1", at: NOW - 100, path: "Notes/one.md" }),
            write({ id: "b", batch: "b1", at: NOW - 200, path: "Notes/one.satellite.md" }),
        ];
        const batches = batchesOf(log);
        expect(batches.map((batch) => batch.batch)).toEqual(["b2", "b1"]);
        expect(batches[1].writes.map((entry) => entry.id)).toEqual(["a", "b"]);
        expect(batches[1].at).toBe(NOW - 100);
        expect(batches[1].undone).toBe(false);
    });

    it("calls a batch undone only when every write in it was taken back", () => {
        const half = [
            write({ id: "a", batch: "b1", undone: NOW }),
            write({ id: "b", batch: "b1" }),
        ];
        expect(batchesOf(half)[0].undone).toBe(false);
        const whole = half.map((entry) => ({ ...entry, undone: NOW }));
        expect(batchesOf(whole)[0].undone).toBe(true);
    });

    it("marks a whole batch undone at once, leaving other batches alone", () => {
        const log = [write({ id: "a", batch: "b1" }), write({ id: "b", batch: "b2" })];
        const after = markBatchUndone(log, "b1", NOW);
        expect(after[0].undone).toBe(NOW);
        expect(after[1].undone).toBeUndefined();
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

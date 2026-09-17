import { describe, it, expect } from "@jest/globals";
import {
    appendRun,
    clearRuns,
    hookPropertyOf,
    surfacesInLog,
    clampRetention,
    DEFAULT_RETENTION_DAYS,
    failureSummary,
    filterRuns,
    MAX_RETENTION_DAYS,
    pruneRuns,
    summariseInput,
    type ScriptRun,
} from "application/scripts/scriptRunLog";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

const run = (extra: Partial<ScriptRun> = {}): ScriptRun => ({
    id: extra.id ?? "r1",
    at: extra.at ?? NOW,
    surface: extra.surface ?? "action",
    origin: extra.origin ?? { ref: "Flows/Zettel.canvas#step-1" },
    durationMs: extra.durationMs ?? 4,
    ok: extra.ok ?? true,
    ...(extra.error ? { error: extra.error } : {}),
    ...(extra.inputKeys ? { inputKeys: extra.inputKeys } : {}),
});

describe("a run is kept for a while, then forgotten (#444)", () => {
    it("keeps the newest first", () => {
        const log = appendRun([run({ id: "old", at: NOW - 1000 })], run({ id: "new" }), {
            now: NOW,
            retentionDays: DEFAULT_RETENTION_DAYS,
        });
        expect(log.map((entry) => entry.id)).toEqual(["new", "old"]);
    });

    it("drops what is older than the window", () => {
        const log = [run({ id: "yesterday", at: NOW - DAY }), run({ id: "lastMonth", at: NOW - 8 * DAY })];
        expect(pruneRuns(log, { now: NOW, retentionDays: 7 }).map((e) => e.id)).toEqual(["yesterday"]);
    });

    it("keeps that same run when the window is thirty days", () => {
        const log = [run({ id: "lastWeek", at: NOW - 8 * DAY })];
        expect(pruneRuns(log, { now: NOW, retentionDays: 30 })).toHaveLength(1);
    });

    it("keeps a run sitting exactly on the boundary", () => {
        const log = [run({ id: "edge", at: NOW - 7 * DAY })];
        expect(pruneRuns(log, { now: NOW, retentionDays: 7 })).toHaveLength(1);
    });

    it("says nothing about an empty log", () => {
        expect(pruneRuns([], { now: NOW, retentionDays: 7 })).toEqual([]);
    });

    it("holds the window between a day and a month", () => {
        expect(clampRetention(0)).toBe(1);
        expect(clampRetention(45)).toBe(MAX_RETENTION_DAYS);
        expect(clampRetention(undefined)).toBe(DEFAULT_RETENTION_DAYS);
        expect(clampRetention(7.4)).toBe(7);
    });
});

describe("reading the log (#444)", () => {
    const log = [
        run({ id: "a", surface: "hook", origin: { ref: "hook-1", notePath: "Notes/A.md" }, ok: false }),
        run({ id: "b", surface: "action", origin: { ref: "flow#step" } }),
        run({ id: "c", surface: "hook", origin: { ref: "hook-1", notePath: "Notes/B.md" } }),
    ];

    it("filters by surface, by script and by note", () => {
        expect(filterRuns(log, { surface: "hook" }).map((e) => e.id)).toEqual(["a", "c"]);
        expect(filterRuns(log, { ref: "flow#step" }).map((e) => e.id)).toEqual(["b"]);
        expect(filterRuns(log, { notePath: "Notes/B.md" }).map((e) => e.id)).toEqual(["c"]);
    });

    it("filters down to the failures, alone or combined", () => {
        expect(filterRuns(log, { failuresOnly: true }).map((e) => e.id)).toEqual(["a"]);
        expect(filterRuns(log, { surface: "hook", failuresOnly: true }).map((e) => e.id)).toEqual(["a"]);
    });

    it("counts one script's failures from the entries themselves", () => {
        expect(failureSummary(log, "hook-1")).toEqual({ count: 1, lastAt: NOW });
        expect(failureSummary(log, "flow#step")).toEqual({ count: 0 });
    });
});

describe("a log is not a copy of your vault (#444, FR-4)", () => {
    it("summarises what a script was handed by name, never by value", () => {
        expect(summariseInput({ note: { title: "Atomicity" }, zf: {}, app: {} })).toEqual([
            "note",
            "zf",
            "app",
        ]);
        expect(summariseInput(undefined)).toEqual([]);
    });
});

describe("what the log can be filtered by (#447)", () => {
    it("offers only the surfaces that are actually in it", () => {
        const log = [run({ surface: "hook" }), run({ surface: "hook" }), run({ surface: "library" })];
        expect(surfacesInLog(log)).toEqual(["hook", "library"]);
        expect(surfacesInLog([])).toEqual([]);
    });

    it("clears to nothing", () => {
        expect(clearRuns()).toEqual([]);
    });

    it("recognises a run that came from a property hook, so it can be reopened", () => {
        expect(hookPropertyOf(run({ origin: { ref: "hook:state" } }))).toBe("state");
        expect(hookPropertyOf(run({ origin: { ref: "flow#step" } }))).toBeUndefined();
        expect(hookPropertyOf(run({ origin: {} }))).toBeUndefined();
    });
});

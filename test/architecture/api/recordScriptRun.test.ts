import { describe, it, expect, jest } from "@jest/globals";
import { recordScriptRun, withScriptRun, type ScriptRunSink } from "architecture/api/lib/recordScriptRun";
import type { ScriptRun } from "application/scripts/scriptRunLog";

function sink(overrides: Partial<ScriptRunSink> = {}) {
    let state = { runs: [] as ScriptRun[], retentionDays: 7 };
    let clock = 1_000;
    return {
        read: () => state,
        write: (next: typeof state) => {
            state = next;
        },
        now: () => (clock += 5),
        id: () => `id-${state.runs.length}`,
        ...overrides,
        get state() {
            return state;
        },
    } as ScriptRunSink & { state: typeof state };
}

describe("a run is written down (#444)", () => {
    it("keeps the facts and the input's names", () => {
        const store = sink();
        recordScriptRun(
            {
                surface: "hook",
                origin: { ref: "hook-1", notePath: "Notes/A.md" },
                durationMs: 12,
                ok: true,
                input: { note: { title: "x" }, zf: {} },
            },
            store
        );
        expect(store.state.runs).toHaveLength(1);
        expect(store.state.runs[0]).toMatchObject({
            surface: "hook",
            origin: { ref: "hook-1", notePath: "Notes/A.md" },
            durationMs: 12,
            ok: true,
            inputKeys: ["note", "zf"],
        });
        expect(store.state.runs[0].error).toBeUndefined();
    });

    it("keeps an error's message, and its line when the runtime gave one", () => {
        const store = sink();
        const error = new Error("boom");
        error.stack = "Error: boom\n    at eval (eval at <anonymous> (app.js:1:1), <anonymous>:3:7)";
        recordScriptRun({ surface: "action", origin: {}, durationMs: 1, ok: false, error }, store);
        expect(store.state.runs[0].error).toEqual({ message: "boom", line: 3 });
    });

    it("never breaks the thing it is observing", () => {
        const store = sink({
            write: () => {
                throw new Error("disk full");
            },
        });
        expect(() =>
            recordScriptRun({ surface: "action", origin: {}, durationMs: 1, ok: true }, store)
        ).not.toThrow();
    });
});

describe("timing a run records both outcomes (#444)", () => {
    it("records a success and returns its value", async () => {
        const store = sink();
        const value = await withScriptRun({ surface: "selector", origin: { ref: "step" } }, async () => 42, store);
        expect(value).toBe(42);
        expect(store.state.runs[0]).toMatchObject({ ok: true, surface: "selector" });
        expect(store.state.runs[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("records a failure and rethrows it untouched", async () => {
        const store = sink();
        const boom = new Error("nope");
        await expect(
            withScriptRun({ surface: "condition", origin: { ref: "flow" } }, async () => {
                throw boom;
            }, store)
        ).rejects.toBe(boom);
        expect(store.state.runs[0]).toMatchObject({ ok: false, surface: "condition" });
        expect(store.state.runs[0].error?.message).toBe("nope");
    });

    it("does not swallow a failure just because recording failed", async () => {
        const store = sink({
            write: () => {
                throw new Error("disk full");
            },
        });
        const spy = jest.fn();
        await expect(
            withScriptRun({ surface: "action", origin: {} }, async () => {
                spy();
                throw new Error("the real one");
            }, store)
        ).rejects.toThrow("the real one");
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

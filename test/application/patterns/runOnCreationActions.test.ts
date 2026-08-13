import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { runOnCreationActions, OnCreationContext } from "application/patterns/runOnCreationActions";
import { log } from "architecture/monitoring/Logger";
import type { Action, ExecuteInfo } from "architecture/api";

const action = (id: string): Action => ({ type: id, id, hasUI: false, key: id, zone: "frontmatter" });
const ctx = { content: {}, note: {}, context: {} } as unknown as OnCreationContext;

describe("runOnCreationActions (#170, FR-3, AC-1)", () => {
    beforeEach(() => jest.restoreAllMocks());

    it("runs the actions in declared order", async () => {
        const calls: string[] = [];
        const impls: Record<string, { execute: (info: ExecuteInfo) => void }> = {
            a: { execute: () => void calls.push("a") },
            b: { execute: () => void calls.push("b") },
            c: { execute: () => void calls.push("c") },
        };
        await runOnCreationActions([action("a"), action("b"), action("c")], ctx, (type) => impls[type]);
        expect(calls).toEqual(["a", "b", "c"]);
    });

    it("catches a failing action, logs it, and still runs the rest", async () => {
        const errorSpy = jest.spyOn(log, "error").mockImplementation(() => undefined);
        const calls: string[] = [];
        const impls: Record<string, { execute: (info: ExecuteInfo) => void }> = {
            a: { execute: () => void calls.push("a") },
            b: { execute: () => { throw new Error("boom"); } },
            c: { execute: () => void calls.push("c") },
        };
        await runOnCreationActions([action("a"), action("b"), action("c")], ctx, (type) => impls[type]);
        expect(calls).toEqual(["a", "c"]);
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it("is a no-op for an empty list and skips unknown action types", async () => {
        const execute = jest.fn();
        await runOnCreationActions([], ctx, () => ({ execute }));
        expect(execute).not.toHaveBeenCalled();
        await runOnCreationActions([action("missing")], ctx, () => undefined);
        expect(execute).not.toHaveBeenCalled();
    });

    it("passes each action as element {...action, result:null} plus the shared context", async () => {
        const received: ExecuteInfo[] = [];
        const a = action("a");
        await runOnCreationActions([a], ctx, () => ({ execute: (info) => void received.push(info) }));
        expect(received[0].element).toEqual({ ...a, result: null });
        expect(received[0].content).toBe(ctx.content);
        expect(received[0].note).toBe(ctx.note);
        expect(received[0].context).toBe(ctx.context);
    });
});

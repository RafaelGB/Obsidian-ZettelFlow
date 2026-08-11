import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { log } from "architecture";
import { evaluateBindingCondition } from "architecture/plugin/events/condition";

const ctx = { notePath: "notes/a.md", event: "note.created" };

afterEach(() => jest.restoreAllMocks());

describe("evaluateBindingCondition — scripted zf condition, throw-isolated (AC-2, AC-10, FR-4)", () => {
    it("returns true when there is no condition (absent = always)", async () => {
        const runScript = jest.fn();
        await expect(evaluateBindingCondition(undefined, ctx, runScript)).resolves.toBe(true);
        expect(runScript).not.toHaveBeenCalled();
    });

    it("treats a blank/whitespace condition as absent", async () => {
        await expect(evaluateBindingCondition("   ", ctx, jest.fn())).resolves.toBe(true);
    });

    it("returns true for a truthy script result", async () => {
        const runScript = jest.fn(async () => "yes");
        await expect(evaluateBindingCondition("return note.type", ctx, runScript)).resolves.toBe(
            true
        );
        expect(runScript).toHaveBeenCalledWith("return note.type", ctx);
    });

    it("returns false for a falsy script result", async () => {
        const runScript = jest.fn(async () => false);
        await expect(evaluateBindingCondition("return false", ctx, runScript)).resolves.toBe(false);
    });

    it("returns false (no throw) when the script reads a missing key → undefined", async () => {
        const runScript = jest.fn(async () => undefined);
        await expect(evaluateBindingCondition("return note.missing", ctx, runScript)).resolves.toBe(
            false
        );
    });

    it("returns false AND logs a skip when the script throws — no exception escapes", async () => {
        const debug = jest.spyOn(log, "debug");
        const runScript = jest.fn(async () => {
            throw new Error("boom");
        });
        await expect(
            evaluateBindingCondition("throw new Error()", ctx, runScript)
        ).resolves.toBe(false);
        expect(debug).toHaveBeenCalled();
    });

    it("returns false when the script is synchronously invalid (throws immediately)", async () => {
        const runScript = jest.fn(() => {
            throw new SyntaxError("bad");
        });
        await expect(evaluateBindingCondition("=(", ctx, runScript)).resolves.toBe(false);
    });
});

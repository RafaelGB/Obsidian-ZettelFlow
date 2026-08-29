import { describe, it, expect } from "@jest/globals";
import {
    buildConditionExpression,
    CONDITION_OPERATORS,
    type ConditionClause,
} from "architecture/plugin/events/conditionBuilder";
import { sanityCheckCondition } from "architecture/plugin/events/conditionHelp";

const clause = (over: Partial<ConditionClause>): ConditionClause => ({
    field: "event.newValue",
    operator: "equals",
    value: "done",
    ...over,
});

describe("buildConditionExpression (#235, #318 S5)", () => {
    it("composes each operator into the exact runtime shape", () => {
        expect(buildConditionExpression(clause({ operator: "equals" })).expression).toBe('event.newValue === "done"');
        expect(buildConditionExpression(clause({ operator: "not-equals" })).expression).toBe('event.newValue !== "done"');
        expect(buildConditionExpression(clause({ operator: "contains" })).expression).toBe('String(event.newValue).includes("done")');
        expect(buildConditionExpression(clause({ operator: "starts-with" })).expression).toBe('String(event.newValue).startsWith("done")');
        expect(buildConditionExpression(clause({ operator: "ends-with" })).expression).toBe('String(event.newValue).endsWith("done")');
        expect(buildConditionExpression(clause({ operator: "greater-than", value: "30" })).expression).toBe("Number(event.newValue) > 30");
        expect(buildConditionExpression(clause({ operator: "less-than", value: "5" })).expression).toBe("Number(event.newValue) < 5");
    });

    it("omits the value for the emptiness operators", () => {
        expect(buildConditionExpression(clause({ operator: "is-empty", value: "" })).expression).toBe("!event.newValue");
        expect(buildConditionExpression(clause({ operator: "is-not-empty", value: "" })).expression).toBe("!!event.newValue");
    });

    it("safely quotes a value that contains quotes (no injection into the expression)", () => {
        const built = buildConditionExpression(clause({ value: 'a" || true || "b' }));
        expect(built.ok).toBe(true);
        expect(built.expression).toBe('event.newValue === "a\\" || true || \\"b"');
    });

    it("every emitted expression passes the runtime sanity check", () => {
        for (const op of CONDITION_OPERATORS) {
            const built = buildConditionExpression(clause({ operator: op.id, value: op.numeric ? "10" : "x" }));
            expect(built.ok).toBe(true);
            expect(sanityCheckCondition(built.expression!).ok).toBe(true);
        }
    });

    it("rejects an incomplete or nonsensical clause with a clear message", () => {
        expect(buildConditionExpression(clause({ field: "  " }))).toEqual({ ok: false, error: "pick a field" });
        expect(buildConditionExpression(clause({ operator: "nope" }))).toEqual({ ok: false, error: "pick an operator" });
        expect(buildConditionExpression(clause({ operator: "equals", value: "  " }))).toEqual({ ok: false, error: "a value is required" });
        expect(buildConditionExpression(clause({ operator: "greater-than", value: "soon" }))).toEqual({ ok: false, error: "the value must be a number" });
    });
});

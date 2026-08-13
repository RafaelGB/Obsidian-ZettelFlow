import { describe, it, expect } from "@jest/globals";
import {
    CONDITION_FIELDS,
    CONDITION_EXAMPLES,
    sanityCheckCondition,
} from "architecture/plugin/events/conditionHelp";

describe("conditionHelp vocabulary (#246 B1)", () => {
    it("exposes the event-payload fields with accessors and notes", () => {
        expect(CONDITION_FIELDS.length).toBeGreaterThanOrEqual(5);
        for (const field of CONDITION_FIELDS) {
            expect(field.accessor.startsWith("event.")).toBe(true);
            expect(field.note.length).toBeGreaterThan(0);
        }
    });

    it("ships ready-to-use examples, including the blank 'always' one", () => {
        expect(CONDITION_EXAMPLES.some((e) => e.condition === "")).toBe(true);
        expect(CONDITION_EXAMPLES.some((e) => e.condition.includes("==="))).toBe(true);
    });
});

describe("sanityCheckCondition (#246 B1)", () => {
    it("accepts a blank condition (always)", () => {
        expect(sanityCheckCondition("")).toEqual({ ok: true });
        expect(sanityCheckCondition("   ")).toEqual({ ok: true });
    });

    it("accepts valid comparisons", () => {
        expect(sanityCheckCondition("event.tag === 'idea'").ok).toBe(true);
        expect(sanityCheckCondition("event.property === 'status' && event.newValue === 'done'").ok).toBe(true);
        expect(sanityCheckCondition("event.notePath.startsWith('Projects/')").ok).toBe(true);
        expect(sanityCheckCondition("!event.oldValue && !!event.newValue").ok).toBe(true);
    });

    it("flags unbalanced brackets", () => {
        expect(sanityCheckCondition("event.notePath.startsWith('Projects/'").ok).toBe(false);
        expect(sanityCheckCondition("(event.tag === 'idea'").error).toBe("unbalanced brackets");
    });

    it("flags a mistaken single = (assignment instead of comparison)", () => {
        const check = sanityCheckCondition("event.property = 'status'");
        expect(check.ok).toBe(false);
        expect(check.error).toContain("===");
    });
});

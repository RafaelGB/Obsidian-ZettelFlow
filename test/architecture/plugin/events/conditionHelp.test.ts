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

describe("sanityCheckCondition modal regression guard (#258 AC-2, AC-3, FR-3)", () => {
    it("flags unbalanced parens (missing close paren)", () => {
        const check = sanityCheckCondition("event.notePath.startsWith('foo'");
        expect(check.ok).toBe(false);
        expect(check.error).toBe("unbalanced brackets");
    });

    it("flags bare = as assignment error and mentions ===", () => {
        const check = sanityCheckCondition("event.property = 'status'");
        expect(check.ok).toBe(false);
        expect(check.error).toContain("===");
    });

    it("accepts a valid === expression without blocking", () => {
        expect(sanityCheckCondition("event.tag === 'idea'")).toEqual({ ok: true });
    });

    it("has at least 2 non-empty CONDITION_EXAMPLES ready to insert", () => {
        expect(CONDITION_EXAMPLES.filter((e) => e.condition !== "").length).toBeGreaterThanOrEqual(2);
    });
});

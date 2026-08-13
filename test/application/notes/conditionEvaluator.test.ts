import { describe, it, expect } from "@jest/globals";
import {
    evaluateCondition,
    parseEdgeCondition,
    evaluateEdgeGate,
    EvalContext,
} from "application/notes/conditionEvaluator";

const ctx = (fm: Record<string, unknown> = {}, title = "Test", canvas = "Board"): EvalContext => ({
    frontmatter: fm,
    noteTitle: title,
    canvasName: canvas,
});

describe("evaluateCondition — equality checks", () => {
    it("returns true when string property matches", () => {
        expect(evaluateCondition('frontmatter.type === "meeting"', ctx({ type: "meeting" }))).toBe(true);
    });

    it("returns false when string property does not match", () => {
        expect(evaluateCondition('frontmatter.type === "meeting"', ctx({ type: "standup" }))).toBe(false);
    });

    it("returns false for missing frontmatter key", () => {
        expect(evaluateCondition('frontmatter.type === "meeting"', ctx({}))).toBe(false);
    });

    it("supports !== operator", () => {
        expect(evaluateCondition('frontmatter.type !== "draft"', ctx({ type: "published" }))).toBe(true);
    });

    it("evaluates note.title", () => {
        expect(evaluateCondition('note.title === "My note"', ctx({}, "My note"))).toBe(true);
    });

    it("evaluates canvas.name", () => {
        expect(evaluateCondition('canvas.name === "Board"', ctx())).toBe(true);
    });

    it("evaluates numeric literals", () => {
        expect(evaluateCondition("frontmatter.count === 5", ctx({ count: 5 }))).toBe(true);
    });

    it("evaluates boolean literals", () => {
        expect(evaluateCondition("frontmatter.active === true", ctx({ active: true }))).toBe(true);
    });
});

describe("evaluateCondition — boolean operators", () => {
    it("evaluates &&", () => {
        const result = evaluateCondition(
            'frontmatter.type === "meeting" && frontmatter.status === "open"',
            ctx({ type: "meeting", status: "open" })
        );
        expect(result).toBe(true);
    });

    it("short-circuits && when first is false", () => {
        const result = evaluateCondition(
            'frontmatter.type === "meeting" && frontmatter.status === "open"',
            ctx({ type: "standup", status: "open" })
        );
        expect(result).toBe(false);
    });

    it("evaluates ||", () => {
        const result = evaluateCondition(
            'frontmatter.type === "meeting" || frontmatter.type === "standup"',
            ctx({ type: "standup" })
        );
        expect(result).toBe(true);
    });

    it("evaluates ! (negation)", () => {
        expect(evaluateCondition('!frontmatter.type === "meeting"', ctx({ type: "standup" }))).toBe(true);
    });

    it("evaluates grouped expressions", () => {
        const result = evaluateCondition(
            '(frontmatter.type === "meeting") && (frontmatter.status === "open")',
            ctx({ type: "meeting", status: "open" })
        );
        expect(result).toBe(true);
    });
});

describe("evaluateCondition — error handling", () => {
    it("throws SyntaxError for invalid expression", () => {
        expect(() => evaluateCondition("this is not valid @@", ctx())).toThrow(SyntaxError);
    });

    it("throws SyntaxError for unterminated string", () => {
        expect(() => evaluateCondition('frontmatter.type === "meeting', ctx())).toThrow(SyntaxError);
    });
});

describe("parseEdgeCondition", () => {
    it("extracts expression from 'if: ...' label", () => {
        expect(parseEdgeCondition('if: frontmatter.type === "meeting"')).toBe('frontmatter.type === "meeting"');
    });

    it("is case-insensitive for the prefix", () => {
        expect(parseEdgeCondition('IF: x === "y"')).toBe('x === "y"');
    });

    it("returns undefined for a plain label", () => {
        expect(parseEdgeCondition("Next step")).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
        expect(parseEdgeCondition(undefined)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
        expect(parseEdgeCondition("")).toBeUndefined();
    });
});

describe("evaluateEdgeGate — IF block gate reusing the #119 evaluator (AC-4)", () => {
    it("opens an unconditional edge (no 'if:' prefix)", () => {
        expect(evaluateEdgeGate("Next step", ctx())).toEqual({ open: true, invalid: false });
        expect(evaluateEdgeGate(undefined, ctx())).toEqual({ open: true, invalid: false });
    });

    it("opens when a truthy condition holds", () => {
        expect(
            evaluateEdgeGate('if: frontmatter.type === "literature"', ctx({ type: "literature" }))
        ).toEqual({ open: true, invalid: false });
    });

    it("closes when the condition is false", () => {
        expect(
            evaluateEdgeGate('if: frontmatter.type === "literature"', ctx({ type: "fleeting" }))
        ).toEqual({ open: false, invalid: false });
    });

    it("evaluates a missing frontmatter key without throwing (absent → null)", () => {
        // absent key resolves to null, so `!== "x"` is a definite, non-throwing true
        expect(evaluateEdgeGate('if: frontmatter.missing !== "x"', ctx())).toEqual({
            open: true,
            invalid: false,
        });
    });

    it("safe-opens and flags an invalid expression (never throws)", () => {
        const result = evaluateEdgeGate("if: === &&", ctx());
        expect(result.open).toBe(true);
        expect(result.invalid).toBe(true);
    });
});

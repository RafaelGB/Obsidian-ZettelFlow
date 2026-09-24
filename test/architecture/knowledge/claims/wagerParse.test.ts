import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { log } from "architecture";
import { horizonAt, toDateInput, wagerOf } from "architecture/knowledge/claims/wager";
import { isWagerKey } from "architecture/knowledge/claims/keys";
import { ClaimSourceSchema } from "architecture/knowledge/claims/ClaimSourceSchema";

afterEach(() => jest.restoreAllMocks());

/**
 * A claim with a date (#570, epic #560).
 *
 * The one rule that is a real bug if it is wrong: a horizon is the start of **its own local day**.
 * `Date.parse("2026-12-01")` is UTC midnight, so west of Greenwich a wager would come due the
 * evening before — and *never before its horizon* is the promise a user would notice breaking.
 */
describe("a day you typed is a day where you are (#570)", () => {
    it("reads a plain date as local midnight", () => {
        const at = horizonAt("2026-12-01");
        expect(at).toBeDefined();
        const date = new Date(at as number);
        expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 11, 1]);
        expect([date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([0, 0, 0]);
    });

    it("round-trips what was typed", () => {
        expect(toDateInput(horizonAt("2026-01-09") as number)).toBe("2026-01-09");
        expect(toDateInput(horizonAt("2026-12-31") as number)).toBe("2026-12-31");
    });

    it("has no horizon for anything it cannot read", () => {
        for (const value of ["soon", "", "   ", "2026-13-45", "2026-02-30", null, undefined, {}, [], true]) {
            expect({ value, at: horizonAt(value) }).toEqual({ value, at: undefined });
        }
    });

    it("accepts a date object and a number, as the same local day", () => {
        const noon = new Date(2026, 5, 15, 12, 30);
        expect(horizonAt(noon)).toBe(new Date(2026, 5, 15).getTime());
        expect(horizonAt(noon.getTime())).toBe(new Date(2026, 5, 15).getTime());
        expect(horizonAt(Number.NaN)).toBeUndefined();
    });

    it("never complains about a date it cannot read", () => {
        // A hand-edited property is not an error. The claim keeps working; the horizon is absent.
        const error = jest.spyOn(log, "error").mockImplementation(() => undefined);
        const warn = jest.spyOn(log, "warn").mockImplementation(() => undefined);
        horizonAt("whenever");
        wagerOf({ expect: "sales fall", by: "whenever" });
        expect(error).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });
});

/**
 * Both halves, or it is not a wager (#570 FR-4).
 *
 * An expectation with no date cannot be resolved, and a date with no expectation is a reminder —
 * the one thing this epic refuses to become. It also makes a `by:` that means something else
 * entirely inert.
 */
describe("a wager needs both halves (#570)", () => {
    it("is a wager only when both are there", () => {
        expect(wagerOf({ expect: "sales fall", by: "2026-12-01" })).toEqual({
            expectation: "sales fall",
            at: new Date(2026, 11, 1).getTime(),
        });
    });

    it("is nothing when either half is missing or unreadable", () => {
        for (const frontmatter of [
            { expect: "sales fall" },
            { by: "2026-12-01" },
            { expect: "   ", by: "2026-12-01" },
            { expect: "sales fall", by: "soon" },
            { expect: 42, by: "2026-12-01" },
            {},
        ]) {
            expect({ frontmatter, wager: wagerOf(frontmatter) }).toEqual({ frontmatter, wager: undefined });
        }
        expect(wagerOf(undefined)).toBeUndefined();
    });

    it("leaves a note whose `by` means an author alone", () => {
        // Someone's `by: Rafael Gómez` is not a horizon, and a claim beside it is not a wager.
        expect(wagerOf({ claim: "microservices move complexity", by: "Rafael Gómez" })).toBeUndefined();
    });

    it("names its two keys where every other reader looks", () => {
        expect(isWagerKey("expect")).toBe(true);
        expect(isWagerKey("by")).toBe(true);
        expect(isWagerKey("claim")).toBe(false);
        expect(isWagerKey("source")).toBe(false);
    });

    it("changes nothing about what a note claims", () => {
        // `Idea` gains no field and the schema is untouched: a wager is two properties beside the
        // claim, not a new object in the model.
        const schema = new ClaimSourceSchema();
        const withWager = schema.parse({
            path: "Notes/a.md",
            frontmatter: { claim: "sales fall", expect: "they fall", by: "2026-12-01" },
        });
        const without = schema.parse({
            path: "Notes/a.md",
            frontmatter: { claim: "sales fall" },
        });
        expect(withWager).toEqual(without);
    });
});

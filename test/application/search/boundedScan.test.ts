import { describe, it, expect } from "@jest/globals";
import { boundedScan, describeScan, SCAN_LIMIT } from "application/search/boundedScan";

const numbers = Array.from({ length: 500 }, (_, index) => index);

describe("a search that says what it searched (#461)", () => {
    it("finds what matches and reports how much it looked at", async () => {
        const result = await boundedScan(numbers.slice(0, 10), (n) => Promise.resolve(n % 3 === 0));
        expect(result.matches).toEqual([0, 3, 6, 9]);
        expect(result.scanned).toBe(10);
        expect(result.stoppedEarly).toBe(false);
    });

    it("stops at its limit and says so, rather than quietly truncating", async () => {
        const result = await boundedScan(numbers, () => Promise.resolve(true), { limit: 25 });
        expect(result.scanned).toBe(25);
        expect(result.stoppedEarly).toBe(true);
        // The honest part: a caller that ignores `stoppedEarly` still sees a count that does not
        // claim the whole vault was covered.
        expect(result.matches).toHaveLength(25);
    });

    it("has a default limit, so a caller cannot forget to bound it", async () => {
        expect(SCAN_LIMIT).toBeGreaterThan(0);
        const many = Array.from({ length: SCAN_LIMIT + 10 }, (_, index) => index);
        const result = await boundedScan(many, () => Promise.resolve(false));
        expect(result.scanned).toBe(SCAN_LIMIT);
        expect(result.stoppedEarly).toBe(true);
    });

    it("does nothing at all when it is cancelled before it starts", async () => {
        const controller = new AbortController();
        controller.abort();
        const result = await boundedScan(numbers, () => Promise.resolve(true), {
            signal: controller.signal,
        });
        expect(result.scanned).toBe(0);
        expect(result.cancelled).toBe(true);
    });

    it("stops promptly when it is cancelled part-way, and keeps what it found", async () => {
        const controller = new AbortController();
        const result = await boundedScan(numbers, (n) => {
            if (n === 4) controller.abort();
            return Promise.resolve(n % 2 === 0);
        }, { signal: controller.signal });
        expect(result.cancelled).toBe(true);
        expect(result.scanned).toBeLessThan(numbers.length);
        expect(result.matches).toEqual([0, 2, 4]);
    });

    it("keeps going when one item cannot be read", async () => {
        const result = await boundedScan([1, 2, 3], (n) => {
            if (n === 2) throw new Error("unreadable");
            return Promise.resolve(true);
        });
        // One unreadable file must not lose the other forty-nine thousand.
        expect(result.matches).toEqual([1, 3]);
        expect(result.scanned).toBe(3);
        expect(result.failed).toBe(1);
    });

    it("handles an empty set without pretending it searched something", async () => {
        const result = await boundedScan([], () => Promise.resolve(true));
        expect(result).toMatchObject({ matches: [], scanned: 0, stoppedEarly: false, cancelled: false });
    });

    it("describes a complete search by what it covered", () => {
        expect(describeScan({ matches: [], scanned: 214, stoppedEarly: false, cancelled: false, failed: 0 }))
            .toEqual({ key: "scan_searched", count: 214 });
    });

    it("describes a search that stopped early as exactly that", () => {
        expect(describeScan({ matches: [], scanned: 500, stoppedEarly: true, cancelled: false, failed: 0 }))
            .toEqual({ key: "scan_stopped_early", count: 500 });
    });

    it("describes a cancelled search as cancelled, not as finished", () => {
        expect(describeScan({ matches: [], scanned: 12, stoppedEarly: false, cancelled: true, failed: 0 }))
            .toEqual({ key: "scan_cancelled", count: 12 });
    });
});

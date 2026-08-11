import { describe, it, expect } from "@jest/globals";
import { ThrottleGate, THROTTLE_WINDOW_SECONDS } from "architecture/plugin/events/throttle";

const WINDOW_MS = THROTTLE_WINDOW_SECONDS * 1000;

describe("ThrottleGate — per-binding-per-note burst collapse (AC-6)", () => {
    it("defaults to a seconds-scale window", () => {
        expect(THROTTLE_WINDOW_SECONDS).toBe(2);
    });

    it("allows the first fire and denies the rest inside the window", () => {
        const gate = new ThrottleGate();
        expect(gate.shouldFire("k", 0)).toBe(true);
        expect(gate.shouldFire("k", 100)).toBe(false);
        expect(gate.shouldFire("k", WINDOW_MS - 1)).toBe(false);
    });

    it("allows again once the window has elapsed", () => {
        const gate = new ThrottleGate();
        expect(gate.shouldFire("k", 0)).toBe(true);
        expect(gate.shouldFire("k", WINDOW_MS)).toBe(true);
        expect(gate.shouldFire("k", WINDOW_MS + 1)).toBe(false);
    });

    it("collapses a burst of N events to a single allow", () => {
        const gate = new ThrottleGate();
        const allows = [0, 10, 20, 30, 40].filter((t) => gate.shouldFire("k", t));
        expect(allows).toEqual([0]);
    });

    it("throttles each key (binding+note) independently", () => {
        const gate = new ThrottleGate();
        expect(gate.shouldFire("note-a", 0)).toBe(true);
        expect(gate.shouldFire("note-b", 0)).toBe(true);
        expect(gate.shouldFire("note-a", 100)).toBe(false);
        expect(gate.shouldFire("note-b", 100)).toBe(false);
    });

    it("honours a custom window", () => {
        const gate = new ThrottleGate(500);
        expect(gate.shouldFire("k", 0)).toBe(true);
        expect(gate.shouldFire("k", 499)).toBe(false);
        expect(gate.shouldFire("k", 500)).toBe(true);
    });
});

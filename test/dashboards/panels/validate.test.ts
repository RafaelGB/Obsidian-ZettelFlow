import { describe, it, expect } from "@jest/globals";
import { isMappingComplete } from "dashboards/panels";

describe("mapping completeness (S2 — the negative state)", () => {
    it("a stat needs a value, unless it counts", () => {
        expect(isMappingComplete("stat", {})).toBe(false);
        expect(isMappingComplete("stat", { value: "note.x" })).toBe(true);
        expect(isMappingComplete("stat", { aggregate: "count" })).toBe(true);
    });

    it("a bar needs a category and at least one series", () => {
        expect(isMappingComplete("bar", { category: "note.when" })).toBe(false);
        expect(isMappingComplete("bar", { series: ["note.hours"] })).toBe(false);
        expect(isMappingComplete("bar", { category: "note.when", series: [] })).toBe(false);
        expect(isMappingComplete("bar", { category: "note.when", series: ["note.hours"] })).toBe(true);
    });
});

import { describe, it, expect } from "@jest/globals";
import { resolveSystemDifficulty, SYSTEM_DIFFICULTY } from "application/community/systemDifficulty";

/** #285 — the gallery difficulty badge: a system's own field wins, else the built-in fallback map. */
describe("resolveSystemDifficulty", () => {
    it("returns the template's own difficulty when present", () => {
        expect(resolveSystemDifficulty({ template_type: "system", title: "Anything", difficulty: "hard" })).toBe("hard");
    });

    it("falls back to the built-in map (case-insensitive) by title", () => {
        expect(resolveSystemDifficulty({ template_type: "system", title: "GTD" })).toBe("medium");
        expect(resolveSystemDifficulty({ template_type: "system", title: "  Concept note " })).toBe("easy");
        expect(resolveSystemDifficulty({ template_type: "system", title: "Academic research" })).toBe("hard");
    });

    it("returns undefined for non-system templates or unknown systems", () => {
        expect(resolveSystemDifficulty({ template_type: "action", title: "GTD" })).toBeUndefined();
        expect(resolveSystemDifficulty({ template_type: "system", title: "Made-up system" })).toBeUndefined();
    });

    it("every fallback difficulty is a valid level", () => {
        for (const value of Object.values(SYSTEM_DIFFICULTY)) {
            expect(["easy", "medium", "hard"]).toContain(value);
        }
    });
});

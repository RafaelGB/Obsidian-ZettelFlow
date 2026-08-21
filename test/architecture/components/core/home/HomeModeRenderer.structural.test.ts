import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
    join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "home", "HomeModeRenderer.ts"),
    "utf8"
);

describe("HomeModeRenderer recommendations wiring (#273, AC-4/AC-5)", () => {
    it("consumes the pure recommendation module (not deep knowledge analyses)", () => {
        expect(src).toMatch(/from "architecture\/components\/core\/home\/homeRecommendations"/);
        // No deep import of a specific knowledge analysis — Home reads the primitive via the module.
        expect(src).not.toMatch(/from "architecture\/knowledge\/(debt|balance|discovery)\//);
    });

    it("navigates, and does NOT execute a command (navigation-not-execution)", () => {
        expect(src).toContain("openLinkText");
        expect(src).not.toContain("actionsStore");
        expect(src).not.toMatch(/\.execute\(/);
    });
});

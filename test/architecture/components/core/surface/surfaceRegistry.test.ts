import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { SURFACES, locateSourceView, defaultMode } from "architecture/components/core/surface/surfaceRegistry";

describe("surface registry (#272, AC-1/AC-6)", () => {
    it("declares exactly three surfaces", () => {
        // The count went 4 → 3 → 4. #484 absorbed the Graph surface, which hosted one mode
        // answering the same question Explore answers, in another place. #487 then gave Explore
        // its own room: Discovery's four modes are narrow lists that live in a side panel, and a
        // workspace cannot be moved out of a pane while it is one of them. The honest reading is
        // "the Graph surface was absorbed and Explore took its place", not "a box was saved".
        // 4 → 3 → 4 → 3. #484 absorbed the Graph, #487 gave Explore its own room, and #504
        // dissolved Discovery — whose four modes answered two questions that already had homes:
        // *what next* (Home) and *what is around this note* (the note's own view).
        expect(SURFACES.map((s) => s.viewType)).toEqual([
            "zettelflow-home",
            "zettelflow-health",
            "zettelflow-explore",
        ]);
    });

    it("hosts the retired views as modes, each exactly once (net-new modes have no sourceView)", () => {
        // 5 retired views survive as modes; the rest redirect via legacyTargets rather than being
        // modes: the 2 Graph views (#280/#484), knowledge-dashboard (#314), and Discovery's four
        // (#504 — two to Home, two to the note's own view).
        const sources = SURFACES.flatMap((s) => s.modes.map((m) => m.sourceView)).filter(
            (s): s is string => s !== undefined
        );
        expect(sources).toHaveLength(4);
        expect(new Set(sources).size).toBe(4);
    });

    it("locateSourceView resolves every retired source to its (surface, mode); defaultMode is the first mode", () => {
        for (const surface of SURFACES) {
            expect(defaultMode(surface.viewType)).toBe(surface.modes[0].id);
            for (const mode of surface.modes) {
                if (!mode.sourceView) continue; // net-new modes (e.g. Explore, Think) fold no retired view
                expect(locateSourceView(mode.sourceView)).toEqual({ surface: surface.viewType, mode: mode.id });
            }
        }
        expect(locateSourceView("nope")).toBeNull();
        expect(defaultMode("nope")).toBeNull();
    });

    it("the pure surface data modules import no platform API (§XI-style)", () => {
        const root = join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "surface");
        for (const file of ["surfaceRegistry.ts", "legacyTargets.ts"]) {
            const src = readFileSync(join(root, file), "utf8");
            const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
            expect(imports).not.toMatch(/from\s+["']obsidian["']/);
        }
    });
});

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { SURFACES, locateSourceView, defaultMode } from "architecture/components/core/surface/surfaceRegistry";

describe("surface registry (#272, AC-1/AC-6)", () => {
    it("declares exactly four surfaces", () => {
        expect(SURFACES.map((s) => s.viewType)).toEqual([
            "zettelflow-home",
            "zettelflow-health",
            "zettelflow-discovery",
            "zettelflow-graph",
        ]);
    });

    it("hosts the 12 retired views, each exactly once (net-new modes have no sourceView)", () => {
        const sources = SURFACES.flatMap((s) => s.modes.map((m) => m.sourceView)).filter(
            (s): s is string => s !== undefined
        );
        expect(sources).toHaveLength(12);
        expect(new Set(sources).size).toBe(12);
    });

    it("locateSourceView resolves every retired source to its (surface, mode); defaultMode is the first mode", () => {
        for (const surface of SURFACES) {
            expect(defaultMode(surface.viewType)).toBe(surface.modes[0].id);
            for (const mode of surface.modes) {
                if (!mode.sourceView) continue; // net-new modes (e.g. Graph 3D) fold no retired view
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

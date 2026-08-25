import { describe, it, expect } from "@jest/globals";
import { LEGACY_OPEN_TARGETS, LEGACY_VIEW_TARGETS } from "architecture/components/core/surface/legacyTargets";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";

const isValidTarget = (t: { surface: string; mode: string }) =>
    SURFACES.some((s) => s.viewType === t.surface && s.modes.some((m) => m.id === t.mode));

describe("legacy back-compat targets (#272, AC-2)", () => {
    it("maps all 12 retired opener commands to a valid (surface, mode)", () => {
        const commands = Object.keys(LEGACY_OPEN_TARGETS);
        expect(commands).toHaveLength(12);
        for (const cmd of commands) expect(isValidTarget(LEGACY_OPEN_TARGETS[cmd])).toBe(true);
    });

    it("maps all 11 redirect view types to a valid (surface, mode) — never self-redirecting home", () => {
        const types = Object.keys(LEGACY_VIEW_TARGETS);
        expect(types).toHaveLength(11);
        expect(types).not.toContain("zettelflow-home");
        for (const type of types) expect(isValidTarget(LEGACY_VIEW_TARGETS[type])).toBe(true);
    });

    it("every retired-view-backed mode is reachable by at least one alias command", () => {
        const aliasedModes = new Set(Object.values(LEGACY_OPEN_TARGETS).map((t) => `${t.surface}:${t.mode}`));
        for (const surface of SURFACES) {
            for (const mode of surface.modes) {
                if (!mode.sourceView) continue; // net-new modes (e.g. Graph 3D) have no retired alias command
                expect(aliasedModes.has(`${surface.viewType}:${mode.id}`)).toBe(true);
            }
        }
    });
});

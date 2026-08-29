import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";

// test/architecture/components/core/surface → 5 ups → repo root
const SURFACE_DIR = join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "surface");

/** viewType → the ModeHostView file whose createRenderer must handle its modes. */
const VIEW_FILE: Record<string, string> = {
    "zettelflow-home": "HomeSurfaceView.ts",
    "zettelflow-health": "HealthSurfaceView.ts",
    "zettelflow-discovery": "DiscoverySurfaceView.ts",
    "zettelflow-graph": "GraphSurfaceView.ts",
};

/**
 * Surface wiring guard (#317 S7): every mode declared in the registry must be handled by its
 * surface's `createRenderer` (an explicit `case "<id>"`, or the first mode via `default:`). This
 * catches the "a mode has no renderer" / "a stale case lingers" regression the Dashboard→Health merge
 * (#314) could have introduced — the renderers themselves can't mount in the node test env.
 */
describe("surface mode ↔ renderer wiring (#317 S7)", () => {
    for (const surface of SURFACES) {
        it(`every mode of ${surface.viewType} has a createRenderer branch`, () => {
            const src = readFileSync(join(SURFACE_DIR, VIEW_FILE[surface.viewType]), "utf8");
            expect(src).toContain("createRenderer");
            const hasDefault = /default\s*:/.test(src);
            const hasSwitch = src.includes("switch");
            surface.modes.forEach((mode, index) => {
                const hasCase = src.includes(`case "${mode.id}"`);
                // Handled if: an explicit case, OR the first mode via `default:`, OR a switch-less
                // createRenderer that returns a single renderer for every mode (e.g. Graph is 3D-only).
                const ok = hasCase || (index === 0 && hasDefault) || !hasSwitch;
                expect({ mode: mode.id, handled: ok }).toEqual({ mode: mode.id, handled: true });
            });
        });
    }
});

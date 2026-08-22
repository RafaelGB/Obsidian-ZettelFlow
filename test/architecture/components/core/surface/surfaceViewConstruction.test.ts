import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/architecture/components/core/surface → 5 ups → repo root
const SURFACE_DIR = join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "surface");
const read = (file: string) => readFileSync(join(SURFACE_DIR, file), "utf8");

/**
 * Regression (#278 view-construction crash): Obsidian's `ItemView` base calls `getViewType()` from
 * inside its constructor (during `super()`), before any subclass field initializer runs. A surface
 * whose `getViewType()` read a `surface` field (`this.surface.viewType`) therefore crashed with
 * "Cannot read properties of undefined (reading 'viewType')" for EVERY surface. Each surface view must
 * return its view type as a construction-safe **literal**, and must not back it with a field.
 */
describe("surface views expose a construction-safe getViewType (#278)", () => {
    const cases: Array<[string, string]> = [
        ["HomeSurfaceView.ts", "zettelflow-home"],
        ["HealthSurfaceView.ts", "zettelflow-health"],
        ["DiscoverySurfaceView.ts", "zettelflow-discovery"],
        ["GraphSurfaceView.ts", "zettelflow-graph"],
    ];

    for (const [file, viewType] of cases) {
        it(`${file} returns "${viewType}" from a literal getViewType`, () => {
            const src = read(file);
            const pattern = new RegExp(`getViewType\\(\\)\\s*:\\s*string\\s*\\{\\s*return\\s*"${viewType}"`);
            expect(src).toMatch(pattern);
        });

        it(`${file} does not back the view type with a crashing surface field`, () => {
            const src = read(file);
            // The field initializer runs after super(), so getViewType() would read undefined during construction.
            expect(src).not.toMatch(/surface\s*(:\s*Surface\s*)?=\s*surfaceByType\(/);
        });
    }

    it("ModeHostView derives the surface from getViewType, not an abstract field", () => {
        const src = read("ModeHostView.ts");
        expect(src).not.toMatch(/abstract\s+readonly\s+surface\b/);
        expect(src).toMatch(/get\s+surface\(\)\s*:\s*Surface\s*\{\s*return\s+surfaceByType\(this\.getViewType\(\)\)/);
    });
});

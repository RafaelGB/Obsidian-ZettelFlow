import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
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

    it("maps all 12 redirect view types to a valid (surface, mode) — never self-redirecting home", () => {
        // Twelve since #484: `zettelflow-graph` joined the list when its surface went away, so a
        // workspace saved before the merge reopens Explore instead of an empty pane.
        const types = Object.keys(LEGACY_VIEW_TARGETS);
        expect(types).toHaveLength(12);
        expect(types).toContain("zettelflow-graph");
        expect(types).not.toContain("zettelflow-home");
        for (const type of types) expect(isValidTarget(LEGACY_VIEW_TARGETS[type])).toBe(true);
    });

    it("every graph door lands on Explore, with the graph lens (#484)", () => {
        // Nobody loses a binding when a surface goes away: four ids kept, all repointed.
        for (const id of ["show-knowledge-map", "show-concept-nav"]) {
            expect(LEGACY_OPEN_TARGETS[id]).toEqual({
                surface: "zettelflow-discovery",
                mode: "ask",
                lens: "graph",
            });
        }
        expect(LEGACY_VIEW_TARGETS["zettelflow-graph"]).toEqual({
            surface: "zettelflow-discovery",
            mode: "ask",
            lens: "graph",
        });
        // The two direct doors keep their ids and ask for the same state.
        const menu = readFileSync(
            join(__dirname, "..", "..", "..", "..", "..", "src", "starters", "zcomponents", "ZettelFlowMenuComponent.ts"),
            "utf8"
        );
        for (const id of ["show-graph", "explore-in-3d"]) expect(menu).toContain(`id: "${id}"`);
        expect(menu).not.toContain('"zettelflow-graph"');
        expect(menu.match(/lens: "graph"/g) ?? []).toHaveLength(2);
    });

    it("every retired-view-backed mode is reachable by at least one alias command", () => {
        const aliasedModes = new Set(Object.values(LEGACY_OPEN_TARGETS).map((t) => `${t.surface}:${t.mode}`));
        for (const surface of SURFACES) {
            for (const mode of surface.modes) {
                if (!mode.sourceView) continue; // net-new modes (e.g. Explore) have no retired alias command
                expect(aliasedModes.has(`${surface.viewType}:${mode.id}`)).toBe(true);
            }
        }
    });
});

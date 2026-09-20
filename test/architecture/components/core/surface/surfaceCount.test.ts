import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";

// test/architecture/components/core/surface → 5 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const SURFACE_TYPES = ["zettelflow-home", "zettelflow-health", "zettelflow-discovery", "zettelflow-explore"];

/** The 12 retired opener commands kept as aliases (must still be registered somewhere). */
const ALIAS_COMMANDS = [
    "show-home",
    "show-slipbox-health",
    "show-knowledge-dashboard",
    "show-evolution-timeline",
    "show-thinking-heatmap",
    "show-discoveries",
    "resurface-related-notes",
    "show-open-questions",
    "show-evidence-map",
    "show-knowledge-map",
    "show-concept-nav",
    "show-notes-history",
];

/** The per-view openers that must NOT appear in the ribbon menu (it lists only the surfaces). */
const RETIRED_IN_MENU = ALIAS_COMMANDS.filter((id) => id !== "show-home");

describe("surface consolidation (#272, AC-3/AC-4; the count's history is in surfaceRegistry.test)", () => {
    it("main.ts registers exactly the 4 surfaces + the legacy redirect loop", () => {
        const main = read("src/main.ts");
        for (const type of SURFACE_TYPES) {
            expect(main).toContain(`this.registerView("${type}"`);
        }
        // The Graph surface is gone: the 3D graph is a lens inside Explore (#484).
        expect(main).not.toContain('this.registerView("zettelflow-graph"');
        expect(main).not.toContain("GraphSurfaceView");
        expect(main).toMatch(/for \(const legacyType of Object\.keys\(LEGACY_VIEW_TARGETS\)\)/);
        // No retired view class is registered any more (they are gone).
        expect(main).not.toMatch(/new (SlipboxHealthView|KnowledgeDashboardView|DiscoveriesView|ConceptNavView)\(/);
    });

    it("the ribbon menu references only the surface commands, none of the retired per-view openers", () => {
        const menu = read("src/starters/zcomponents/ZettelFlowMenuComponent.ts");
        expect(menu).toContain("show-health");
        expect(menu).toContain("show-discovery");
        for (const retired of RETIRED_IN_MENU) {
            expect(menu.includes(`"${retired}"`)).toBe(false);
        }
    });

    it("draws no mode bar for a surface with a single mode (#487)", () => {
        // A bar offering one choice is not a choice, and an ARIA tablist of one is noise for a
        // screen reader too. The same rule Explore's own lens bar already follows.
        const host = read("src/architecture/components/core/surface/ModeHostView.ts");
        expect(host).toContain("this.surface.modes.length > 1 ? this.surface.modes : []");
        expect(SURFACES.filter((surface) => surface.modes.length === 1).map((s) => s.viewType)).toEqual([
            "zettelflow-explore",
        ]);
    });

    it("keeps launchers out of the settings tab (#439), and names no retired view type", () => {
        // The four surfaces are opened from the menu button and the command palette. A settings
        // panel that launches things is a menu wearing a panel's clothes, and it cost nine rows.
        const tab = read("src/config/modals/ZettelFlowSettingsTab.tsx");
        expect(tab).not.toContain("activateSurface");
        expect(tab).not.toContain("activateSidebarView");
        const retiredTypes = [
            "zettelflow-slipbox-health", "zettelflow-knowledge-dashboard", "zettelflow-evolution-timeline",
            "zettelflow-thinking-heatmap", "zettelflow-discoveries", "zettelflow-resurface",
            "zettelflow-open-questions", "zettelflow-evidence-map", "zettelflow-knowledge-map",
            "zettelflow-concept-nav", "zettelflow-history",
        ];
        for (const type of retiredTypes) {
            expect(tab.includes(`"${type}"`)).toBe(false);
        }
    });

    it("all 12 retired opener commands still exist as aliases (no visible breakage)", () => {
        // The 11 pure openers are consolidated into SurfaceCommandsComponent; Home keeps its own (#303 S3).
        const components = ["HomeComponent", "SurfaceCommandsComponent"]
            .map((name) => read(`src/starters/zcomponents/${name}.ts`))
            .join("\n");
        for (const id of ALIAS_COMMANDS) {
            expect(components.includes(`"${id}"`)).toBe(true);
        }
    });
});

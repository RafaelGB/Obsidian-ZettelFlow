import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/architecture/components/core/surface → 5 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const SURFACE_TYPES = ["zettelflow-home", "zettelflow-health", "zettelflow-discovery", "zettelflow-graph"];

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

/** The 11 per-view openers that must NOT appear in the ribbon menu (it lists only the 4 surfaces). */
const RETIRED_IN_MENU = ALIAS_COMMANDS.filter((id) => id !== "show-home");

describe("four-surface consolidation (#272, AC-3/AC-4)", () => {
    it("main.ts registers exactly the 4 surfaces + the legacy redirect loop", () => {
        const main = read("src/main.ts");
        for (const type of SURFACE_TYPES) {
            expect(main).toContain(`this.registerView("${type}"`);
        }
        expect(main).toMatch(/for \(const legacyType of Object\.keys\(LEGACY_VIEW_TARGETS\)\)/);
        // No retired view class is registered any more (they are gone).
        expect(main).not.toMatch(/new (SlipboxHealthView|KnowledgeDashboardView|DiscoveriesView|ConceptNavView)\(/);
    });

    it("the ribbon menu references only the four surface commands, none of the retired per-view openers", () => {
        const menu = read("src/starters/zcomponents/ZettelFlowMenuComponent.ts");
        expect(menu).toContain("show-health");
        expect(menu).toContain("show-discovery");
        expect(menu).toContain("show-graph");
        for (const retired of RETIRED_IN_MENU) {
            expect(menu.includes(`"${retired}"`)).toBe(false);
        }
    });

    it("the settings launchers open surfaces, not the retired view types", () => {
        const tab = read("src/config/modals/ZettelFlowSettingsTab.tsx");
        expect(tab).toContain("activateSurface");
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

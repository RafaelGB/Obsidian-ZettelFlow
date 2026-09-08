import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/architecture/components/core/askGraph → 5 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const RENDERER = read("src/architecture/components/core/askGraph/AskGraphRenderer.ts");
const MENU = read("src/starters/zcomponents/ZettelFlowMenuComponent.ts");
const DISCOVERY = read("src/architecture/components/core/surface/DiscoverySurfaceView.ts");
const HOME = read("src/architecture/components/core/home/HomeModeRenderer.ts");

/**
 * Ask-your-graph as a first-class Discovery mode (#323, promotes the #318 S3 modal). The command opens
 * the surface tab (not a modal); the renderer runs the deterministic engine through the Knowledge State
 * barrel, persists saved queries, recomputes live, and never writes.
 */
describe("ask-your-graph surface mode (#323)", () => {
    it("the command opens the Discovery surface in the ask mode, not a modal", () => {
        expect(MENU).toContain('id: "ask-your-graph"');
        expect(MENU).toContain('activateSurface(this.plugin.app, "zettelflow-discovery", "ask")');
        expect(MENU).not.toContain("AskGraphModal");
    });

    it("the Discovery surface mounts the ask renderer for the ask mode", () => {
        expect(DISCOVERY).toContain('case "ask":');
        expect(DISCOVERY).toContain("new AskGraphRenderer(");
    });

    it("runs the pure engine from the Knowledge State barrel", () => {
        expect(RENDERER).toContain('from "architecture/knowledge/state"');
        expect(RENDERER).toContain("runGraphQuery(");
        expect(RENDERER).toContain("GRAPH_QUERY_EXAMPLES");
    });

    it("persists saved queries and recomputes live on vault change", () => {
        expect(RENDERER).toContain("savedGraphQueries");
        expect(RENDERER).toContain("saveSettings()");
        expect(RENDERER).toMatch(/metadataCache\.on\("resolved"/);
    });

    it("offers result lenses — a list and a table (#323 G3)", () => {
        expect(RENDERER).toContain("ask-graph-lens");
        expect(RENDERER).toContain("renderTable(");
        expect(RENDERER).toMatch(/ask_graph_col_/);
    });

    it("offers rename, reorder and pin-to-Home on saved queries (#323 G4)", () => {
        expect(RENDERER).toContain("renameSavedQuery");
        expect(RENDERER).toContain("moveSavedQuery");
        expect(RENDERER).toContain("togglePinnedQuery");
        expect(RENDERER).toContain("savedQueryLabel");
    });

    it("Home surfaces pinned queries with a live match count that deep-links back (#323 G4)", () => {
        expect(HOME).toContain("pinnedQueries");
        expect(HOME).toContain("runGraphQuery(");
        expect(HOME).toContain("home_pinned_query_count");
        expect(HOME).toMatch(/activateSurface\(this\.app, "zettelflow-discovery", "ask"/);
    });

    it("is read-only — never imports a write path or mutates the vault", () => {
        expect(RENDERER).not.toMatch(/FileService|FrontmatterService|CultivationService/);
        expect(RENDERER).not.toMatch(/\.(modify|createFile|process[Ff]rontMatter)\(/);
    });
});

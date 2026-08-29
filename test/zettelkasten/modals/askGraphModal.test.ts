import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/zettelkasten/modals → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const MODAL = readFileSync(join(ROOT, "src", "zettelkasten", "modals", "AskGraphModal.ts"), "utf8");
const MENU = readFileSync(join(ROOT, "src", "starters", "zcomponents", "ZettelFlowMenuComponent.ts"), "utf8");

/**
 * Ask-your-graph surface wiring (#318 S3). The pure `runGraphQuery` engine is surfaced through a
 * command + a read-only modal that persists saved queries. The modal must consume the engine through
 * the Knowledge State barrel, persist to `savedGraphQueries`, and never touch a vault write path.
 */
describe("ask-your-graph surface (#318 S3)", () => {
    it("registers the `ask-your-graph` command that opens the modal", () => {
        expect(MENU).toContain('id: "ask-your-graph"');
        expect(MENU).toContain("new AskGraphModal(");
    });

    it("runs the pure engine from the Knowledge State barrel", () => {
        expect(MODAL).toContain('from "architecture/knowledge/state"');
        expect(MODAL).toContain("runGraphQuery(");
        expect(MODAL).toContain("GRAPH_QUERY_EXAMPLES");
    });

    it("persists saved queries through settings", () => {
        expect(MODAL).toContain("savedGraphQueries");
        expect(MODAL).toContain("this.plugin.saveSettings()");
    });

    it("is read-only — it never imports a write path or mutates the vault", () => {
        expect(MODAL).not.toMatch(/FileService|FrontmatterService|CultivationService/);
        expect(MODAL).not.toMatch(/\.(modify|createFile|process[Ff]rontMatter)\(/);
    });
});

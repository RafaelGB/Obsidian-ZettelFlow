import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/zettelkasten/modals → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const MODAL = readFileSync(
    join(ROOT, "src", "zettelkasten", "modals", "ReasoningPathsModal.ts"),
    "utf8"
);
const MENU = readFileSync(
    join(ROOT, "src", "starters", "zcomponents", "ZettelFlowMenuComponent.ts"),
    "utf8"
);

/**
 * Reasoning-paths surface wiring (#318 S4). The pure `reasoningPaths` projection (#166) was headless;
 * this locks that it is now surfaced through a note-scoped command + a read-only modal. The modal must
 * consume the projection through the Knowledge State barrel and never touch a write path — it is a lens.
 */
describe("reasoning-paths surface (#318 S4)", () => {
    it("registers a note-scoped `explore-reasoning-paths` command that opens the modal", () => {
        expect(MENU).toContain('id: "explore-reasoning-paths"');
        expect(MENU).toContain("checkCallback"); // gated on an active markdown file
        expect(MENU).toContain("new ReasoningPathsModal(");
        expect(MENU).toMatch(/file\.extension !== "md"/);
    });

    it("consumes the pure projection from the Knowledge State barrel", () => {
        expect(MODAL).toContain('from "architecture/knowledge/state"');
        expect(MODAL).toContain("reasoningPaths(");
    });

    it("is read-only — it never imports a write path or mutates the vault", () => {
        expect(MODAL).not.toMatch(/FileService|FrontmatterService|CultivationService/);
        expect(MODAL).not.toMatch(/\.(modify|create|createFile|process[Ff]rontMatter)\(/);
    });
});

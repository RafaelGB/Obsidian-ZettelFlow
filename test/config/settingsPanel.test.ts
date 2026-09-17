import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const TAB = readFileSync(join(ROOT, "src", "config", "modals", "ZettelFlowSettingsTab.tsx"), "utf8");

/**
 * The settings panel is for settings (#439, epic #434).
 *
 * It had grown nine rows that configured nothing: four buttons opening surfaces the menu button
 * already opens, and four whose only control was a link to the documentation. A panel that
 * launches and documents is a menu and an index wearing a panel's clothes, and it is the first
 * thing a new user is asked to read.
 */
describe("the settings panel holds settings, and only settings (#439)", () => {
    it("launches nothing", () => {
        expect(TAB).not.toContain("activateSurface");
        expect(TAB).not.toContain("activateSidebarView");
    });

    it("documents nothing — that is what the docs are", () => {
        expect(TAB).not.toContain("addDocsButton");
        expect(TAB).not.toContain("TOOLKIT_DOCS");
    });

    it("keeps the row count a decision rather than an accident", () => {
        // 44 rows in this file before the subtraction. The ceiling is not a target: it exists so
        // the next addition is noticed.
        const rows = TAB.match(/name: t\(/g)?.length ?? 0;
        expect(rows).toBeLessThanOrEqual(35);
    });

    it("asks each merged decision once", () => {
        // A toggle beside the value it gates is two questions for one answer (#439).
        expect(TAB).not.toContain("uniquePrefixEnabled");
        expect(TAB).not.toContain("loggerEnabled");
    });
});

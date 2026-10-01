import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
    join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "home", "HomeModeRenderer.ts"),
    "utf8"
);

describe("HomeModeRenderer recommendations wiring (#273, AC-4/AC-5)", () => {
    it("consumes the pure recommendation module (not deep knowledge analyses)", () => {
        expect(src).toMatch(/from "architecture\/components\/core\/home\/homeRecommendations"/);
        // No deep import of a specific knowledge analysis — Home reads the primitive via the module.
        expect(src).not.toMatch(/from "architecture\/knowledge\/(debt|balance|discovery)\//);
    });

    it("navigates, and does NOT execute a command (navigation-not-execution)", () => {
        expect(src).toContain("openLinkText");
        expect(src).not.toContain("actionsStore");
        expect(src).not.toMatch(/\.execute\(/);
    });
});

describe("Home is a minimalist dashboard (#620)", () => {
    it("fills the pane with the dashboard root and a reflowing grid", () => {
        expect(src).toContain('c("dashboard")');
        expect(src).toContain('c("dashboard-grid")');
    });

    it("carries exactly one primary and a fixed Ask-your-graph icon door to Explore", () => {
        expect((src.match(/\.primary\(/g) ?? []).length).toBe(1);
        // The door is an icon-only nav, named by its tooltip — never a second primary.
        expect(src).toMatch(/iconOnly:\s*true/);
        expect(src).toContain('t("home_ask_graph")');
        expect(src).toContain('activateSurface(this.app, "zettelflow-explore"');
    });

    it("renders exactly three hero tiles, exactly one wearing the accent", () => {
        expect((src.match(/c\("dashboard-card"\)/g) ?? []).length).toBe(3);
        expect((src.match(/dashboard-card--hero/g) ?? []).length).toBe(1);
    });

    it("folds everything else behind a disclosure, collapsed by default, via a class not a style", () => {
        // A state field that starts closed and gates the extra grid with a class — never innerHTML,
        // never an inline style (§I / the Obsidian lint).
        expect(src).toMatch(/showEverything\s*=\s*false/);
        expect(src).toContain('c("is-hidden")');
        expect(src).toContain('"home_show_everything"');
        expect(src).toContain('"home_hide_extras"');
        expect(src).not.toContain(".innerHTML");
        expect(src).not.toMatch(/\.style\./);
    });
});

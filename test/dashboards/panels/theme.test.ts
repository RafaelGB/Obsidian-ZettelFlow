import { describe, it, expect } from "@jest/globals";
import { buildChartTheme, CHART_THEME_VARS } from "dashboards/panels";

describe("chart theme bridge (S2, §XV — the user's theme wins)", () => {
    it("reads Obsidian theme variables when present (trimmed)", () => {
        const theme = buildChartTheme({
            "--text-normal": " #111 ",
            "--text-muted": "#888",
            "--background-modifier-border": "#ccc",
            "--interactive-accent": "#5a67d8",
        });
        expect(theme.text).toBe("#111");
        expect(theme.axis).toBe("#888");
        expect(theme.split).toBe("#ccc");
        expect(theme.palette[0]).toBe("#5a67d8");
    });

    it("falls back when a variable is missing or blank", () => {
        const theme = buildChartTheme({ "--interactive-accent": "   " });
        expect(theme.text).not.toBe("");
        expect(theme.palette.length).toBeGreaterThan(1);
        expect(theme.palette[0]).not.toBe("");
    });

    it("exposes the variable names it samples", () => {
        expect(CHART_THEME_VARS).toContain("--interactive-accent");
        expect(CHART_THEME_VARS).toContain("--text-normal");
    });
});

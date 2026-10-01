/**
 * The chart theme bridge (pure half) — §XV "the user's theme wins". ECharts paints to a canvas, so
 * it cannot inherit CSS; instead we read Obsidian's theme variables and hand ECharts a theme built
 * from them. This module turns a bag of resolved CSS-variable strings into a `ChartTheme`; the DOM
 * reader that samples `getComputedStyle` and the `css-change` re-paint live in `base/themeReader.ts`.
 *
 * Hex literals here are last-resort fallbacks for a missing variable (a TS concern, not a stylesheet
 * — the §XV SCSS guards do not apply); the real colours always come from the user's theme.
 */
export interface ChartTheme {
    text: string;
    axis: string;
    split: string;
    palette: string[];
}

/** The theme variables the chart samples. Kept here so the DOM reader and tests agree. */
export const CHART_THEME_VARS: string[] = [
    "--text-normal",
    "--text-muted",
    "--background-modifier-border",
    "--interactive-accent",
    "--color-green",
    "--color-orange",
    "--color-purple",
    "--color-cyan",
    "--color-yellow",
    "--color-pink",
    "--color-red",
];

const FALLBACK_PALETTE = ["#6c8cff", "#48c78e", "#f2994a", "#9b59b6", "#22d3ee", "#f4d35e", "#ec4899", "#ef4444"];

export function buildChartTheme(vars: Record<string, string>): ChartTheme {
    const read = (name: string, fallback: string): string => {
        const value = vars[name];
        return value && value.trim() ? value.trim() : fallback;
    };

    const accent = read("--interactive-accent", FALLBACK_PALETTE[0]);
    const palette = [
        accent,
        read("--color-green", FALLBACK_PALETTE[1]),
        read("--color-orange", FALLBACK_PALETTE[2]),
        read("--color-purple", FALLBACK_PALETTE[3]),
        read("--color-cyan", FALLBACK_PALETTE[4]),
        read("--color-yellow", FALLBACK_PALETTE[5]),
        read("--color-pink", FALLBACK_PALETTE[6]),
        read("--color-red", FALLBACK_PALETTE[7]),
    ];

    return {
        text: read("--text-normal", "#dcdde3"),
        axis: read("--text-muted", "#9aa0aa"),
        split: read("--background-modifier-border", "#33363d"),
        palette,
    };
}

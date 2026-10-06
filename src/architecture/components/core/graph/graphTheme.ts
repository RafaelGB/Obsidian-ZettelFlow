import { RELATION_COLOR_VARS, STATE_COLOR_VARS, DEFAULT_STATE_COLOR_VAR } from "architecture/knowledge/state";

/** A colour as the GPU wants it: four channels in `0..1`. */
export type Rgba = [number, number, number, number];

/**
 * Every colour the graph draws, read from **the user's theme** (§XV, #693) — the background
 * included.
 *
 * The old view painted a fixed `#0b0e14` sky and eighteen hand-picked hexes tuned for it, so a light
 * theme got a black hole in the middle of a white workspace. Here nothing is chosen: the eight
 * accent colours a theme defines (`--color-red` … `--color-pink`) give the palette, mixed toward the
 * theme's own text and background for more slots, and the sky is `--background-primary`.
 */
export interface GraphTheme {
    bg: Rgba;
    text: Rgba;
    muted: Rgba;
    faint: Rgba;
    accent: Rgba;
    /** The panel colour behind labels. */
    panel: Rgba;
    /** A dark sky: glows add light and the stars come out. A light one: glows tint instead. */
    dark: boolean;
    /** Palette slots, in order (see {@link communityRgba}). */
    palette: Rgba[];
    state: Record<string, Rgba>;
    stateDefault: Rgba;
    relation: Record<string, Rgba>;
    red: Rgba;
    yellow: Rgba;
    pink: Rgba;
}

/**
 * The accent order of the palette: neighbouring slots never share a hue family, so the two biggest
 * regions are never both blue.
 */
export const PALETTE_VARS = [
    "--color-blue",
    "--color-green",
    "--color-orange",
    "--color-purple",
    "--color-cyan",
    "--color-pink",
    "--color-yellow",
    "--color-red",
] as const;

/** How the palette grows past eight: the accent, toward the text, toward the background. */
const TONES: readonly { toward: "text" | "bg" | null; amount: number }[] = [
    { toward: null, amount: 0 },
    { toward: "text", amount: 0.35 },
    { toward: "bg", amount: 0.3 },
];

/** Resolves a CSS colour (as a theme defines it) to sRGB channels in `0..1`, or `null`. */
export type ColourResolver = (css: string) => Rgba | null;

/** Reads a custom property of the theme, unresolved (`var()` already substituted by the browser). */
export type ThemeReader = (name: string) => string;

const FALLBACK: Rgba = [0.6, 0.6, 0.6, 1];

/**
 * Pure: the colours the graph draws, from a theme reader. `resolve` turns any CSS colour into
 * channels — in the app it paints a pixel, so `oklch()`, `color-mix()` and `calc()` all work; in
 * tests {@link parseCssColour} is enough.
 */
export function readGraphTheme(read: ThemeReader, resolve: ColourResolver = parseCssColour): GraphTheme {
    const get = (name: string, fallback: Rgba = FALLBACK): Rgba => resolve(read(name).trim()) ?? fallback;
    const bg = get("--background-primary", [0.12, 0.12, 0.12, 1]);
    const text = get("--text-normal", [0.86, 0.86, 0.86, 1]);
    const base = PALETTE_VARS.map((name) => get(name));
    const palette: Rgba[] = [];
    for (const tone of TONES) {
        for (const colour of base) {
            palette.push(tone.toward === null ? colour : mix(colour, tone.toward === "text" ? text : bg, tone.amount));
        }
    }
    const state: Record<string, Rgba> = {};
    for (const [key, name] of Object.entries(STATE_COLOR_VARS)) state[key] = get(name);
    const relation: Record<string, Rgba> = {};
    for (const [key, name] of Object.entries(RELATION_COLOR_VARS)) relation[key] = get(name);
    return {
        bg,
        text,
        muted: get("--text-muted"),
        faint: get("--text-faint"),
        accent: get("--interactive-accent", base[3]),
        panel: get("--background-primary", bg),
        dark: luminance(bg) < 0.45,
        palette,
        state,
        stateDefault: get(DEFAULT_STATE_COLOR_VAR),
        relation,
        red: get("--color-red"),
        yellow: get("--color-yellow"),
        pink: get("--color-pink"),
    };
}

/** The colour of a community's palette slot; a note that is alone is the theme's muted text. */
export function communityRgba(theme: GraphTheme, slot: number): Rgba {
    if (slot < 0 || theme.palette.length === 0) return theme.muted;
    return theme.palette[slot % theme.palette.length];
}

export function stateRgba(theme: GraphTheme, state: string): Rgba {
    return theme.state[state] ?? theme.stateDefault;
}

export function relationRgba(theme: GraphTheme, type: string): Rgba {
    return theme.relation[type] ?? theme.faint;
}

/** `a` moved toward `b` by `t`, channel by channel in sRGB — what `color-mix(in srgb, …)` does. */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}

/** Relative luminance (WCAG), enough to tell a dark sky from a light one. */
export function luminance(c: Rgba): number {
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** A CSS colour for the DOM (a legend dot) from channels — handed over as a custom property. */
export function cssRgb(c: Rgba, alpha = c[3]): string {
    const ch = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    return `rgba(${ch(c[0])}, ${ch(c[1])}, ${ch(c[2])}, ${Math.round(alpha * 1000) / 1000})`;
}

/**
 * Pure parser for the colour syntaxes a computed style hands back: `#rgb`, `#rrggbb`, `#rrggbbaa`,
 * `rgb()`/`rgba()` (commas or spaces, `/ alpha`), `hsl()`/`hsla()`. Anything else is `null`, and
 * the app's resolver paints it instead.
 */
export function parseCssColour(input: string): Rgba | null {
    const css = input.trim().toLowerCase();
    if (css.startsWith("#")) {
        let hex = css.slice(1);
        if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join("");
        if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return null;
        const n = (at: number) => parseInt(hex.slice(at, at + 2), 16) / 255;
        return [n(0), n(2), n(4), hex.length === 8 ? n(6) : 1];
    }
    const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(css);
    if (!fn) return null;
    const parts = fn[2].replace(/\//g, " ").replace(/,/g, " ").split(/\s+/).filter((part) => part !== "");
    if (parts.length < 3) return null;
    const num = (part: string, scale: number): number | null => {
        const v = parseFloat(part);
        if (!Number.isFinite(v)) return null;
        return part.endsWith("%") ? v / 100 : v / scale;
    };
    const alpha = parts.length > 3 ? num(parts[3], 1) : 1;
    if (alpha === null) return null;
    if (fn[1].startsWith("rgb")) {
        const r = num(parts[0], 255), g = num(parts[1], 255), b = num(parts[2], 255);
        if (r === null || g === null || b === null) return null;
        return [r, g, b, alpha];
    }
    const h = parseFloat(parts[0]);
    const s = num(parts[1], 100), l = num(parts[2], 100);
    if (!Number.isFinite(h) || s === null || l === null) return null;
    return [...hslToRgb(((h % 360) + 360) % 360, s, l), alpha] as Rgba;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
        h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m];
}

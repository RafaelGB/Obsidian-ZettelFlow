import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import en from "architecture/lang/locale/en";

// test/docs → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const DOCS = join(ROOT, "docs");

/**
 * **A settings path in the docs names a group the tab shows** (#800 FR-2, AC-1).
 *
 * The Learn tutorials are written from these pages. A page that sends you to *Settings → Zettelkasten
 * toolkit* sends every tutorial copied from it to a group that has not existed since #659 — and the
 * reader blames the tutorial. So a path is checked against the tab itself: its eight sections
 * (`settings_section_*`) and its sub-headings (`settings_*_heading`), read from the en locale.
 */

/**
 * Obsidian's own settings pages, which a path may name instead of a ZettelFlow group. A closed set:
 * adding a page here needs a reason, because every entry is a way for drift to pass unnoticed.
 */
const OBSIDIAN_PAGES = ["Community plugins", "Files and links", "Appearance", "Hotkeys", "Editor", "About", "Core plugins", "Sync"];

/** History, not instructions: the roadmap's record of what each release changed. */
const EXEMPT = [/development[\\/]project-health-and-roadmap\.md$/, /release/i];

const ENTRIES = Object.entries(en as Record<string, string>);
const GROUPS = new Set<string>([
    ...ENTRIES.filter(([key]) => /^settings_section_[a-z]+$/.test(key)).map(([, value]) => value),
    ...ENTRIES.filter(([key]) => /^settings_.+_heading$/.test(key)).map(([, value]) => value),
]);

interface PathHit {
    line: number;
    segment: string;
}

/** Fenced code blanked line for line, so a hit's line number is still the line in the file. */
function withoutFences(text: string): string {
    return text.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, (block) => block.replace(/[^\n]/g, " "));
}

/**
 * Every *Settings → X* / *Settings › X* / *Settings > X* in a page, as the segment a reader is sent
 * to first. `ZettelFlow` as the first segment is the plugin's own tab, so the segment after it is the
 * one judged. What follows the group (a card, a row) is not: rows are many and are checked by eye.
 */
function settingsPaths(text: string): PathHit[] {
    const body = withoutFences(text);
    const hits: PathHit[] = [];
    const arrow = String.raw`\s*\**\s*[→›>]\s*\**\s*`;
    // A segment ends at emphasis, an arrow, punctuation, a dash or a possessive — whatever ends a name in prose.
    const segment = String.raw`([^*→›>,.:;()|\x60\n—'’]*)`;
    const pattern = new RegExp(String.raw`\bSettings${arrow}${segment}(?:${arrow}${segment})?`, "g");
    for (const match of body.matchAll(pattern)) {
        let first = (match[1] ?? "").trim();
        if (first === "ZettelFlow") {
            first = (match[2] ?? "").trim();
            if (!first) continue; // "Settings → ZettelFlow." — the tab itself.
        }
        if (!first) continue;
        hits.push({ line: body.slice(0, match.index).split("\n").length, segment: first });
    }
    return hits;
}

function isKnownGroup(segment: string): boolean {
    return GROUPS.has(segment) || OBSIDIAN_PAGES.includes(segment);
}

function markdownFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return markdownFiles(full);
        return entry.endsWith(".md") ? [full] : [];
    });
}

describe("the settings-path parser (#800)", () => {
    const judged = (text: string) => settingsPaths(text).map((hit) => [hit.segment, isKnownGroup(hit.segment)]);

    it("reads the group after ZettelFlow", () => {
        expect(judged("Open **Settings → ZettelFlow → Flows → Your flows**.")).toEqual([["Flows", true]]);
    });

    it("reads every arrow the docs use", () => {
        expect(judged("in Settings › Thinking, to keep highlights")).toEqual([["Thinking", true]]);
        expect(judged("go to Settings > Appearance")).toEqual([["Appearance", true]]);
    });

    it("lets an Obsidian page through", () => {
        expect(judged("**Settings → Community plugins → Browse**")).toEqual([["Community plugins", true]]);
    });

    it("lets a sub-heading through", () => {
        expect(judged("(Settings → *Your flows*, see flow roles)")).toEqual([["Your flows", true]]);
    });

    it("refuses a group that does not exist", () => {
        expect(judged("**Settings → ZettelFlow → Zettelkasten toolkit**.")).toEqual([["Zettelkasten toolkit", false]]);
    });

    it("follows a path that wraps onto the next line", () => {
        expect(judged("move it — Settings →\n*Your flows* → set its role")).toEqual([["Your flows", true]]);
    });

    it("ignores fenced code, and keeps the line numbers true", () => {
        const text = "```\nSettings → Nowhere\n```\nthen Settings → Nowhere either";
        expect(settingsPaths(text)).toEqual([{ line: 4, segment: "Nowhere either" }]);
    });

    it("leaves the tab itself alone", () => {
        expect(judged("Open **Settings → ZettelFlow**. The tab")).toEqual([]);
    });
});

describe("every settings path in the docs names a group the tab shows (#800 AC-1)", () => {
    const pages = markdownFiles(DOCS).filter((file) => !EXEMPT.some((rule) => rule.test(file)));
    const hits = pages.flatMap((file) =>
        settingsPaths(readFileSync(file, "utf8")).map((hit) => ({ file: relative(ROOT, file).split(sep).join("/"), ...hit }))
    );

    it("reads enough paths to be worth checking", () => {
        // A vacuous pass is the only way this test can lie.
        expect(hits.length).toBeGreaterThan(40);
        expect(GROUPS.has("Your flows")).toBe(true);
        expect(GROUPS.has("Automation")).toBe(true);
    });

    it("names no group that does not exist", () => {
        const unknown = hits.filter((hit) => !isKnownGroup(hit.segment)).map((hit) => `${hit.file}:${hit.line} → ${hit.segment}`);
        expect(unknown).toEqual([]);
    });
});

describe("mobile support names the views that exist (#800 D11)", () => {
    const page = readFileSync(join(DOCS, "development", "mobile-support.md"), "utf8");

    it.each(["Discovery", "knowledge dashboard", "slip-box health"])("does not offer %s as a view", (retired) => {
        expect(page).not.toContain(retired);
    });

    it("names the surfaces as they are", () => {
        for (const name of ["Home", "Cultivate", "Think", "Tend", "Practice", "Explore", "This note"]) expect(page).toContain(name);
    });
});

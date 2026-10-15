import en from "architecture/lang/locale/en";

/**
 * **A settings path names a group the tab shows** (#800) — the parser, shared by the docs check and
 * the Learn catalog's (#801): the tutorials are written from the docs, so they drift the same way.
 *
 * A path is checked against the tab itself: its eight sections (`settings_section_*`) and its
 * sub-headings (`settings_*_heading`), read from the en locale.
 */

/**
 * Obsidian's own settings pages, which a path may name instead of a ZettelFlow group. A closed set:
 * adding a page here needs a reason, because every entry is a way for drift to pass unnoticed.
 */
export const OBSIDIAN_PAGES = ["Community plugins", "Files and links", "Appearance", "Hotkeys", "Editor", "About", "Core plugins", "Sync"];

const ENTRIES = Object.entries(en as Record<string, string>);
export const GROUPS = new Set<string>([
    ...ENTRIES.filter(([key]) => /^settings_section_[a-z]+$/.test(key)).map(([, value]) => value),
    ...ENTRIES.filter(([key]) => /^settings_.+_heading$/.test(key)).map(([, value]) => value),
]);

export interface PathHit {
    line: number;
    segment: string;
}

/** Fenced code blanked line for line, so a hit's line number is still the line in the file. */
function withoutFences(text: string): string {
    return text.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, (block) => block.replace(/[^\n]/g, " "));
}

/**
 * Every *Settings → X* / *Settings › X* / *Settings > X* in a text, as the segment a reader is sent
 * to first. `ZettelFlow` as the first segment is the plugin's own tab, so the segment after it is the
 * one judged. What follows the group (a card, a row) is not: rows are many and are checked by eye.
 */
export function settingsPaths(text: string): PathHit[] {
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

export function isKnownGroup(segment: string): boolean {
    return GROUPS.has(segment) || OBSIDIAN_PAGES.includes(segment);
}

import type { DomNode } from "./dashboardDom";

/**
 * **Where the Reader says you are** (#812 FR-15, FR-17): the bar's place — the one progress signal —
 * without the screen within the chapter (`· 2 of 3`), which only pages add.
 */
export function place(content: DomNode): string {
    return content.oneByClass("reader-bar-label").textContent.replace(/ · \d+ (of|de) \d+$/, "");
}

/** The line above the text: the chapter's title, or a detour's name; empty when it says nothing. */
export function kicker(content: DomNode): string {
    const el = content.byClass("reader-count")[0];
    return el && !el.hasClass("zettelkasten-flow__reader-hidden") ? el.textContent : "";
}

import type { StaticTemplateOptions } from "config";

/**
 * **The Systems room's catalog** (#799, epic #797) — pure.
 *
 * The gallery used to ask you to choose a type and a difficulty before it showed you anything. The
 * room asks nothing: systems are grouped by what they are — **a whole method** (more than one step)
 * or **one note, done well** — in the catalog's own order, and the steps and templates for your own
 * canvases are folded at the bottom. Search is the only control.
 *
 * The step count comes from the catalog row, not from the template, so grouping never waits on a
 * fetch; `catalog.test.ts` checks every count against the canvas it describes.
 */

export interface SystemsGroups {
    /** Systems of more than one step. */
    methods: StaticTemplateOptions[];
    /** Single-step systems. */
    single: StaticTemplateOptions[];
    /** Steps, actions and markdown templates — pieces for your own canvases. */
    loose: StaticTemplateOptions[];
}

/** Grouped, each group in catalog order. A system that has not said how many steps it has is a method. */
export function groupSystems(entries: readonly StaticTemplateOptions[]): SystemsGroups {
    const groups: SystemsGroups = { methods: [], single: [], loose: [] };
    for (const entry of entries) {
        if (entry.template_type !== "system") groups.loose.push(entry);
        else if ((entry.steps ?? 2) > 1) groups.methods.push(entry);
        else groups.single.push(entry);
    }
    return groups;
}

/** Lower case, accents folded: «PÁRA» is «para». `\p{M}` is a plain character class — fine on iOS. */
export function normalizeForSearch(text: string): string {
    return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** The first sentence: up to the first full stop followed by a space, or the whole text. */
function firstSentence(text: string): string {
    const trimmed = text.trim();
    const at = trimmed.search(/[.!?](\s|$)/);
    return at === -1 ? trimmed : trimmed.slice(0, at + 1);
}

/** The one-line summary in the reader's language, then English, then the description's first sentence. */
export function summaryOf(entry: StaticTemplateOptions, lang: string): string {
    const summary = entry.summary;
    const own = lang === "es" ? summary?.es : lang === "en" ? summary?.en : undefined;
    return own?.trim() || summary?.en?.trim() || firstSentence(entry.description ?? "");
}

/**
 * Whether a row answers a query: its name, the summary you are shown, or its description — ignoring
 * case and accents. Only the summary in your language: a word from the other one is a match you
 * cannot see on the card.
 */
export function matchesQuery(entry: StaticTemplateOptions, query: string, lang: string): boolean {
    const wanted = normalizeForSearch(query.trim());
    if (!wanted) return true;
    const haystack = [entry.title, summaryOf(entry, lang), entry.description]
        .filter((part): part is string => typeof part === "string")
        .join(" ");
    return normalizeForSearch(haystack).includes(wanted);
}

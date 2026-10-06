import { t } from "architecture/lang";

type LocaleKey = Parameters<typeof t>[0];

/** A shape a term can name, as the facets and the chips say it (explicit, so the locale guardrail sees it). */
export const SHAPE_LABEL_KEY: Record<string, LocaleKey> = {
    hub: "explore_shape_hub",
    orphan: "explore_shape_orphan",
    leaf: "explore_shape_leaf",
    unsourced: "explore_shape_unsourced",
    bridge: "explore_shape_bridge",
    alone: "explore_shape_alone",
    contradiction: "explore_shape_contradiction",
};

/**
 * A query term in words (#696): what a chip and a funnel step say, so an answer reads as the question
 * you asked rather than as syntax. The term itself is kept as the chip's title, so nothing is hidden.
 * `regionName` turns a region's hub path into what it is called.
 */
export function termWords(term: string, regionName: (hub: string) => string): string {
    const trimmed = term.trim();
    const negated = trimmed.startsWith("!");
    const bare = negated ? trimmed.slice(1).trim() : trimmed;
    const words = positiveWords(bare, regionName);
    return negated ? t("explore_not", words) : words;
}

function positiveWords(term: string, regionName: (hub: string) => string): string {
    const shape = SHAPE_LABEL_KEY[term.toLowerCase()];
    if (shape) return t(shape);
    const colon = term.indexOf(":");
    if (colon === -1) return term;
    const key = term.slice(0, colon).toLowerCase();
    const arg = term.slice(colon + 1).trim();
    switch (key) {
        case "state":
            return arg;
        case "region":
            return t("explore_term_region", regionName(arg));
        case "folder":
            return t("explore_term_folder", arg);
        case "about":
            return t("explore_term_about", arg);
        case "newer-than":
            return t("explore_term_newer", arg);
        case "older-than":
            return t("explore_term_older", arg);
        case "near":
            return t("explore_term_near", (arg.split("/").pop() ?? arg).replace(/\.md$/i, ""));
        case "relation":
            return `${t("explore_facet_relation")} ${arg}`;
        case "incoming":
            return `${t("explore_facet_incoming")} ${arg}`;
        default:
            return term;
    }
}

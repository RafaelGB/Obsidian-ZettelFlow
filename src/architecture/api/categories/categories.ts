/**
 * The closed vocabulary of **cognitive-capability** categories an Action can belong to (#152) —
 * grouping the flat action registry by *what an action does to knowledge* rather than by technical
 * operation. Mirrors the step-phase pattern (#149): a fixed, ordered token set + `isX` guard + i18n
 * label **keys** (no `t()` here) + decorative emoji. Pure & Obsidian-free. A category is optional on
 * an action; absence means "uncategorized" (keeps third-party actions valid — #33).
 */

export type ActionCategory = "manipulation" | "relations" | "knowledge" | "research" | "ai";

/** The five capabilities, in canonical (display) order. */
export const ACTION_CATEGORIES: readonly ActionCategory[] = [
    "manipulation",
    "relations",
    "knowledge",
    "research",
    "ai",
] as const;

export function isActionCategory(value: unknown): value is ActionCategory {
    return typeof value === "string" && (ACTION_CATEGORIES as readonly string[]).includes(value);
}

/** i18n key of each category's sentence-case label. The `t()` lookup lives in the UI layer. */
export const CATEGORY_LABEL_KEY = {
    manipulation: "action_category_manipulation_label",
    relations: "action_category_relations_label",
    knowledge: "action_category_knowledge_label",
    research: "action_category_research_label",
    ai: "action_category_ai_label",
} as const satisfies Record<ActionCategory, string>;

/** Decorative per-category emoji, rendered before the label in the picker (kept out of i18n). */
export const CATEGORY_EMOJI = {
    manipulation: "📝",
    relations: "🔗",
    knowledge: "🧠",
    research: "🔍",
    ai: "🤖",
} as const satisfies Record<ActionCategory, string>;

/** A group of items sharing a category; `category: null` is the trailing "uncategorized" group. */
export interface CategoryGroup<T> {
    category: ActionCategory | null;
    items: T[];
}

/** Normalize an item's category: a valid token, or `null` when absent/invalid (uncategorized). */
export function getActionCategory(value: unknown): ActionCategory | null {
    return isActionCategory(value) ? value : null;
}

/**
 * Group items by their `category` in canonical order, with the uncategorized group **last**. Empty
 * categories are omitted, and the uncategorized group is omitted when empty — so the picker only ever
 * shows populated groups (#152 decision 4).
 */
export function groupActionsByCategory<T extends { category?: ActionCategory }>(
    items: T[]
): CategoryGroup<T>[] {
    const groups: CategoryGroup<T>[] = [];
    for (const category of ACTION_CATEGORIES) {
        const inCategory = items.filter((item) => getActionCategory(item.category) === category);
        if (inCategory.length) groups.push({ category, items: inCategory });
    }
    const uncategorized = items.filter((item) => getActionCategory(item.category) === null);
    if (uncategorized.length) groups.push({ category: null, items: uncategorized });
    return groups;
}

import { stripWikilink } from "./wikilink";

/** Where a new typed relation went: the property, an inline field, or nowhere (already there). */
export type RelationPlacement = "frontmatter" | "inline" | "none";

export interface AddRelationResult {
    frontmatter: Record<string, unknown>;
    placement: RelationPlacement;
}

const isWikilink = (value: unknown): value is string => typeof value === "string" && /\[\[.+?\]\]/.test(value);

/**
 * Add one typed relation edge (`type → [[target]]`) to a frontmatter object (#641) — the inverse of
 * `removeRelationField`, in the shape `create-semantic-relation` writes (#147/#154).
 *
 * Absent → `"[[X]]"`; one wikilink → a list of two; a list → it grows. A value already there is a
 * no-op. A **plain-text** value under the key (`example: some word` — `example` is also an
 * ordinary word) is not an edge and is never touched: the result says `inline`, and the caller adds
 * an `example:: [[X]]` field to the body instead. Pure; never mutates the input.
 */
export function addRelationValue(
    frontmatter: Record<string, unknown>,
    relationType: string,
    target: string
): AddRelationResult {
    const name = stripWikilink(target).replace(/\.md$/i, "").trim();
    if (!name) return { frontmatter, placement: "none" };
    const link = `[[${name}]]`;
    const current = frontmatter[relationType];

    if (current === undefined || current === null || current === "") {
        return { frontmatter: { ...frontmatter, [relationType]: link }, placement: "frontmatter" };
    }
    const values: unknown[] = Array.isArray(current) ? (current as unknown[]) : [current];
    if (values.some((value) => isWikilink(value) && stripWikilink(value) === name)) {
        return { frontmatter, placement: "none" };
    }
    if (values.some((value) => !isWikilink(value))) return { frontmatter, placement: "inline" };
    return { frontmatter: { ...frontmatter, [relationType]: [...values, link] }, placement: "frontmatter" };
}

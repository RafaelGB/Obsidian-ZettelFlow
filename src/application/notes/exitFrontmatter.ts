import type { FinalElement } from "./typing";

/**
 * The frontmatter a step's exits are evaluated against (#898) — pure.
 *
 * An exit like `frontmatter.origin === "fleeting"` asks about the note being written, so it has to
 * see the answers given in this wizard, not only the note it was opened from. Reading the source
 * note alone closed every exit on a new note (there is no source), and the wizard built the note
 * from the first step without ever reaching the branch that carried the body.
 *
 * The source note is the base; a frontmatter answer from the wizard wins over it, as it will in
 * the note that gets written. Context and body answers are not frontmatter, and an answer with no
 * key or no value yet says nothing.
 */
export function exitFrontmatter(
    sourceFrontmatter: Record<string, unknown>,
    elements: Map<number, FinalElement>
): Record<string, unknown> {
    const frontmatter: Record<string, unknown> = { ...sourceFrontmatter };
    for (const element of elements.values()) {
        if ((element.zone ?? "frontmatter") !== "frontmatter") continue;
        const key = typeof element.key === "string" ? element.key : undefined;
        if (!key) continue;
        const value = element.staticBehaviour ? element.staticValue : element.result;
        if (value === null || value === undefined) continue;
        frontmatter[key] = value;
    }
    return frontmatter;
}

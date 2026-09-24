import { SOURCE_KEYS } from "architecture/knowledge/claims/keys";
import { sourceField } from "actions/attachSource/attachSourceLogic";

/**
 * Where a claim came from (#582, epic #558) — pure.
 *
 * #561 gave the claim a door and left this half in YAML, which had a consequence nobody had felt
 * before: a claim with no `source` **is** `unsourced` by definition (`claims.length > 0 &&
 * !hasSources`), and that category carries weight in the knowledge debt. So the door asked you for
 * a sentence, got one, and answered with a penalty it never mentioned.
 *
 * The fix is the door, not the accounting — and it is the same act `AttachSource` already performs,
 * so the field itself is built by that action's `sourceField`. One writer, not a second one that
 * drifts.
 */

/** Which source the door edits when a note declares several. The first, as with a claim. */
export const SOURCE_EDIT_INDEX = 0;

/** The key this note already uses, or the one the action would write. `SOURCE_KEYS` has two. */
function keyOf(frontmatter: Record<string, unknown>): string {
    return SOURCE_KEYS.find((key) => frontmatter[key] !== undefined) ?? SOURCE_KEYS[0];
}

/** What the note says it came from, as written. Reads **both** keys, because both are the vocabulary. */
export function declaredSources(frontmatter?: Record<string, unknown>): string[] {
    const declared: string[] = [];
    const take = (item: unknown): void => {
        if (typeof item !== "string") return;
        const text = item.trim();
        if (text.length > 0) declared.push(text);
    };
    for (const key of SOURCE_KEYS) {
        const value = frontmatter?.[key];
        if (Array.isArray(value)) value.forEach(take);
        else take(value);
    }
    return declared;
}

/**
 * Put the reference on the note. Returns whether anything was written.
 *
 * It writes under the key the note **already** uses, so a note declaring `sources:` does not sprout
 * a second `source:` beside it — and a list keeps its other entries, which is the data loss this
 * shipped to fix.
 */
export function applySource(frontmatter: Record<string, unknown>, raw: string): boolean {
    const field = sourceField(raw);
    if (!field) return false;

    const key = keyOf(frontmatter);
    const current = frontmatter[key];
    if (Array.isArray(current)) {
        const next: unknown[] = [...(current as unknown[])];
        next[SOURCE_EDIT_INDEX] = field.value;
        frontmatter[key] = next;
        return true;
    }
    frontmatter[key] = field.value;
    return true;
}

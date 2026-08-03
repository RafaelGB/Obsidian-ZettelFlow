export function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    const ta = typeof a;
    const tb = typeof b;
    if (ta !== "object" || tb !== "object" || a === null || b === null) {
        return false;
    }
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        // Si falla la serialización, considera distinto.
        return false;
    }
}

export function hasFrontmatterMutations(
    toSet: Record<string, unknown> = {},
    toRemove: string[] = []
): boolean {
    return Object.keys(toSet).length > 0 || (toRemove?.length ?? 0) > 0;
}

/**
 * Deep, JSON-safe copy of a frontmatter snapshot. Obsidian mutates the object returned by
 * `getFileCache().frontmatter` in place, so a live reference cannot be used as the "previous"
 * value when detecting property changes — we must copy it. This is the crux of the
 * long-standing bug where property hooks never fired (old === new).
 */
export function copyFrontmatter(
    frontmatter: Record<string, unknown> = {}
): Record<string, unknown> {
    try {
        return JSON.parse(JSON.stringify(frontmatter)) as Record<string, unknown>;
    } catch {
        return { ...frontmatter };
    }
}

/**
 * Which of the given hook-watched properties actually changed between two frontmatter
 * snapshots. Returns the changed property names, preserving input order.
 */
export function changedHookProperties(
    properties: string[],
    oldFrontmatter: Record<string, unknown>,
    newFrontmatter: Record<string, unknown>
): string[] {
    return properties.filter(
        (property) => !valuesEqual(oldFrontmatter[property], newFrontmatter[property])
    );
}

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

/**
 * What a frontmatter write actually changed (#453, epic #451) — pure.
 *
 * Every property write in ZettelFlow goes through one `processFrontMatter` call, which hands the
 * caller a mutable object. That is the only moment at which the *before* still exists, so the
 * record is taken there — and taken as a **diff**, not a copy: the keys that changed, with the
 * value each had and the value each was left with.
 *
 * Two consequences, both deliberate:
 *
 * - A write that changed nothing produces **no record**. An idempotent hook setting a property to
 *   the value it already had is not a change, and must not offer you an undo for one.
 * - A key that did not exist before is recorded as `undefined`, not omitted, because restoring has
 *   to be able to **remove** a key ZettelFlow added.
 */

export interface FrontmatterChange {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
}

/** Comparison by value, so a rewritten array of the same tags is not a change. */
function sameValue(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (left === undefined || right === undefined) return false;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        // A value that cannot be serialised (a cycle, a function) is treated as changed: a false
        // "it changed" costs a record, a false "it did not" loses the ability to undo.
        return false;
    }
}

/** A snapshot cheap enough to take on every property write, and deep enough to compare against. */
export function snapshotFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(frontmatter)) {
        try {
            snapshot[key] = value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown);
        } catch {
            snapshot[key] = value;
        }
    }
    return snapshot;
}

/** The keys that differ, each with what it was and what it became. Empty when nothing changed. */
export function diffFrontmatter(
    before: Record<string, unknown>,
    after: Record<string, unknown>
): FrontmatterChange {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};
    for (const key of keys) {
        if (sameValue(before[key], after[key])) continue;
        changedBefore[key] = before[key];
        changedAfter[key] = after[key];
    }
    return { before: changedBefore, after: changedAfter };
}

/** Whether a diff is worth recording at all. */
export function isChange(change: FrontmatterChange): boolean {
    return Object.keys(change.after).length > 0 || Object.keys(change.before).length > 0;
}

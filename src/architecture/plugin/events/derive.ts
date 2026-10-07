/**
 * Deterministic derivation of the *synthesized* workflow events (#150) from a frontmatter/tag
 * snapshot diff. Obsidian has no native `property.changed` / `tag.added` signal, so the engine keeps
 * a per-file snapshot of frontmatter and, on a metadata change, diffs the previous snapshot against
 * the new one here. Same approach the property hooks already use (`copyFrontmatter` +
 * `changedHookProperties`), reimplemented standalone to keep the event core pure & self-contained.
 */

import type { WorkflowEventPayload } from "./vocabulary";

/** The frontmatter key whose values are treated as tags (emitted as `tag.added`, not `property.changed`). */
const TAGS_KEY = "tags";

/** JSON-safe deep equality for frontmatter values (mirrors `CompareUtils.valuesEqual`). */
function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

/** Normalize a frontmatter `tags` value (string | string[] | undefined) to a string list. */
function tagsOf(frontmatter: Record<string, unknown>): string[] {
    const raw = frontmatter[TAGS_KEY];
    if (typeof raw === "string") return [raw];
    if (Array.isArray(raw)) return raw.filter((tag): tag is string => typeof tag === "string");
    return [];
}

/**
 * Diff two frontmatter snapshots for one note into `property.changed` / `tag.added` events.
 * `property.changed` fires once per changed non-tags key (preserving the union-key order); `tag.added`
 * fires once per tag present in `newFrontmatter` but not `oldFrontmatter`. Identical snapshots yield
 * `[]`. A missing snapshot is treated as empty (first sight of a note surfaces its properties/tags).
 */
export function deriveFrontmatterEvents(
    notePath: string,
    oldFrontmatter: Record<string, unknown> | undefined,
    newFrontmatter: Record<string, unknown> | undefined
): WorkflowEventPayload[] {
    const older = oldFrontmatter ?? {};
    const newer = newFrontmatter ?? {};
    const events: WorkflowEventPayload[] = [];

    const keys: string[] = [];
    for (const key of [...Object.keys(older), ...Object.keys(newer)]) {
        if (key !== TAGS_KEY && !keys.includes(key)) keys.push(key);
    }
    for (const property of keys) {
        if (!valuesEqual(older[property], newer[property])) {
            events.push({
                event: "property.changed",
                notePath,
                property,
                oldValue: older[property],
                newValue: newer[property],
            });
        }
    }

    const oldTags = new Set(tagsOf(older));
    for (const tag of tagsOf(newer)) {
        if (!oldTags.has(tag)) events.push({ event: "tag.added", notePath, tag });
    }

    return events;
}

/**
 * Remember every note not already known, as it is now. Without it the first edit of a note since
 * startup was diffed against itself, so adding a property to a note (or the first change to one that
 * was open at startup) never fired `property.changed`. Copies, because Obsidian mutates the cache.
 */
export function seedBaselines(
    baselines: Map<string, Record<string, unknown>>,
    notes: Iterable<[string, Record<string, unknown> | undefined]>
): void {
    for (const [path, frontmatter] of notes) {
        if (!baselines.has(path)) baselines.set(path, JSON.parse(JSON.stringify(frontmatter ?? {})) as Record<string, unknown>);
    }
}

/** A rename keeps the note's baseline: without it the first change after a rename never fired. */
export function moveBaseline(baselines: Map<string, Record<string, unknown>>, oldPath: string, newPath: string): void {
    const baseline = baselines.get(oldPath);
    baselines.delete(oldPath);
    if (baseline) baselines.set(newPath, baseline);
}

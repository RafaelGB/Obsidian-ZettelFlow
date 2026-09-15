/**
 * What the wizard is about to change (#412, epic #405) — pure.
 *
 * The companion pane answered *"what will the note look like?"*. At the moment of committing the
 * question is *"what is about to change, and where?"* — and in **edit mode** the plugin answered it
 * not at all: `onEditorBuild` inserted the merged template at the cursor and ran a document-wide
 * `{{key}}` replace, and the user saw the result only after it happened.
 *
 * Everything here is derived from the **same assembled preview the builder writes**, so the diff
 * cannot drift from reality.
 */

export type ChangeKind = "added" | "changed" | "unchanged";

export interface FrontmatterChange {
    key: string;
    kind: ChangeKind;
    value: unknown;
    /** The baseline value, when this key already existed. */
    previous?: unknown;
}

/** Two steps set the same key. The merge silently picks one; this is what it picked. */
export interface FrontmatterConflict {
    key: string;
    winner: unknown;
    winnerSource: string;
    overridden: { value: unknown; source: string }[];
}

export interface PlaceholderReplacement {
    key: string;
    value: string;
    /** How many occurrences the document-wide replace will touch. */
    occurrences: number;
}

export interface DiffSource {
    /** A human label for the step or action that contributed this frontmatter. */
    label: string;
    frontmatter: Record<string, unknown>;
}

export interface NoteDiff {
    frontmatter: FrontmatterChange[];
    /** Body blocks the build will add, in order. */
    bodyBlocks: string[];
    conflicts: FrontmatterConflict[];
    placeholders: PlaceholderReplacement[];
}

function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

/** Frontmatter keys the build will add or change, plus the ones it leaves alone. */
export function diffFrontmatter(
    baseline: Record<string, unknown>,
    next: Record<string, unknown>
): FrontmatterChange[] {
    const changes: FrontmatterChange[] = [];
    for (const [key, value] of Object.entries(next)) {
        if (!(key in baseline)) {
            changes.push({ key, kind: "added", value });
            continue;
        }
        const previous = baseline[key];
        changes.push(
            sameValue(previous, value)
                ? { key, kind: "unchanged", value, previous }
                : { key, kind: "changed", value, previous }
        );
    }
    return changes.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Keys set by more than one step. The merge rule is *last one wins* (both
 * `assembleNotePreview` and `ContentDTO.addFrontMatter` spread in order), so the winner is the last
 * source that set the key — stated here instead of being lost silently.
 *
 * `tags` is excluded: tags are merged, not overwritten, so two steps setting tags is not a conflict.
 */
export function frontmatterConflicts(sources: DiffSource[]): FrontmatterConflict[] {
    const byKey = new Map<string, { value: unknown; source: string }[]>();
    for (const source of sources) {
        for (const [key, value] of Object.entries(source.frontmatter)) {
            if (key === "tags") continue;
            const entries = byKey.get(key) ?? [];
            entries.push({ value, source: source.label });
            byKey.set(key, entries);
        }
    }

    const conflicts: FrontmatterConflict[] = [];
    for (const [key, entries] of byKey) {
        if (entries.length < 2) continue;
        const distinct = entries.filter(
            (entry, index) => index === 0 || !sameValue(entry.value, entries[0].value)
        );
        // Two steps writing the *same* value is not a conflict anyone needs to resolve.
        if (distinct.length < 2) continue;
        const winner = entries[entries.length - 1];
        conflicts.push({
            key,
            winner: winner.value,
            winnerSource: winner.source,
            overridden: entries.slice(0, -1),
        });
    }
    return conflicts.sort((a, b) => a.key.localeCompare(b.key));
}

/** Body blocks (paragraph-level), which is the grain step templates contribute in. */
export function bodyBlocks(body: string): string[] {
    return body
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter((block) => block.length > 0);
}

/**
 * `{{key}}` occurrences a document-wide replace will touch. Edit mode replaces placeholders
 * everywhere in the note, not just in the inserted text, which nothing used to say.
 */
export function placeholderReplacements(
    document: string,
    modifications: Record<string, string>
): PlaceholderReplacement[] {
    const replacements: PlaceholderReplacement[] = [];
    for (const [key, value] of Object.entries(modifications)) {
        const matches = document.split(`{{${key}}}`).length - 1;
        if (matches === 0) continue;
        replacements.push({ key, value, occurrences: matches });
    }
    return replacements.sort((a, b) => a.key.localeCompare(b.key));
}

/** The whole diff, from one assembled preview and one baseline. */
export function buildNoteDiff(input: {
    baseline: { frontmatter: Record<string, unknown>; body: string };
    preview: { frontmatter: Record<string, unknown>; body: string };
    sources?: DiffSource[];
    documentText?: string;
    modifications?: Record<string, string>;
}): NoteDiff {
    return {
        frontmatter: diffFrontmatter(input.baseline.frontmatter, input.preview.frontmatter),
        bodyBlocks: bodyBlocks(input.preview.body),
        conflicts: frontmatterConflicts(input.sources ?? []),
        placeholders:
            input.documentText && input.modifications
                ? placeholderReplacements(input.documentText, input.modifications)
                : [],
    };
}

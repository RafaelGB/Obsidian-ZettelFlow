import type { ScriptSurface } from "./scriptRunLog";

/**
 * What a script **would** do, worked out without doing it (#446, epic #443) — pure.
 *
 * Only one of the five scripting surfaces could be tried before it ran for real, and it ran
 * against an empty note: `note.getTitle()` blank, `content` empty, anything reading the note you
 * were working on seeing nothing. So the one rehearsal the product had taught you the wrong thing.
 *
 * This is the reading half of the workbench: which bindings a surface hands a script, and what a
 * run left behind, expressed as a difference rather than as a write.
 */

/** The surfaces a script can be tried as; `library` is loaded, not run against a note. */
export const TRYABLE_SURFACES: readonly ScriptSurface[] = [
    "action",
    "selector",
    "hook",
    "condition",
] as const;

/** i18n key per surface, for the picker. */
export const SURFACE_LABEL_KEY: Record<ScriptSurface, string> = {
    action: "workbench_surface_action",
    selector: "workbench_surface_selector",
    hook: "workbench_surface_hook",
    condition: "workbench_surface_condition",
    library: "workbench_surface_library",
    workbench: "workbench_surface_workbench",
};

/** Whether a surface's script is handed the note it runs on. */
export function needsContextNote(surface: ScriptSurface): boolean {
    return surface === "hook" || surface === "condition";
}

/** The state of a note the workbench can compare before and after. */
export interface NoteState {
    title: string;
    body: string;
    frontmatter: Record<string, unknown>;
}

export interface FrontmatterChange {
    key: string;
    from: unknown;
    to: unknown;
}

export interface WouldWrite {
    /** Text the script appended to the body, when it appended any. */
    bodyAdded?: string;
    /** Frontmatter keys it set, changed or removed. */
    frontmatter: FrontmatterChange[];
    /** The title it set, when it set a different one. */
    title?: { from: string; to: string };
    /** Whether it would have written anything at all. */
    touched: boolean;
}

/**
 * What changed between the state a script was handed and the state it left — the whole point
 * being that the workbench shows this **instead of** writing it.
 */
export function summariseWrites(before: NoteState, after: NoteState): WouldWrite {
    const frontmatter: FrontmatterChange[] = [];
    const keys = new Set([...Object.keys(before.frontmatter), ...Object.keys(after.frontmatter)]);
    for (const key of keys) {
        const from = before.frontmatter[key];
        const to = after.frontmatter[key];
        if (JSON.stringify(from) !== JSON.stringify(to)) frontmatter.push({ key, from, to });
    }

    const bodyAdded = after.body.startsWith(before.body)
        ? after.body.slice(before.body.length)
        : after.body;
    const titleChanged = before.title !== after.title;

    return {
        ...(bodyAdded.trim() ? { bodyAdded } : {}),
        frontmatter,
        ...(titleChanged ? { title: { from: before.title, to: after.title } } : {}),
        touched: Boolean(bodyAdded.trim()) || frontmatter.length > 0 || titleChanged,
    };
}

/** What a script will see when no note was picked — stated, never fabricated. */
export function emptyContext(): NoteState {
    return { title: "", body: "", frontmatter: {} };
}

/**
 * Taking a batch back (#454, epic #451) — pure.
 *
 * The record (#453) says what ZettelFlow wrote. This says what undoing it would *do*, as a plan
 * that can be shown to you before a single file moves. Nothing here touches the vault: it takes
 * the writes and a few facts about the current state, and returns a list of intentions.
 *
 * The plan is built to be **refusable**. A note you edited after ZettelFlow wrote it, a property
 * somebody has since changed, an overwrite whose old body was never kept — each of those is a
 * `blocked` entry that names the note and the reason, and each one makes `possible` false. The
 * unblocked work is still planned, because a partial undo should be a decision you take, not a
 * plan we have to rebuild.
 */

import { isUndoableKind, type VaultWrite } from "./vaultWriteLog";

/**
 * How much later than ZettelFlow's own write an mtime may be before we call it somebody else's
 * edit. Writing a note, then its frontmatter, then letting Obsidian index it does not land on one
 * timestamp; five seconds is the lag, not a tolerance for real edits.
 */
export const CHANGED_GRACE_MS = 5_000;

export type BlockedReason = "changed" | "property-changed" | "not-undoable";

export interface BlockedUndo {
    path: string;
    reason: BlockedReason;
    /** For `changed`: when the note was last modified. */
    changedAt?: number;
    /** For `property-changed`: the key that no longer holds what ZettelFlow left. */
    key?: string;
}

export interface UndoPlan {
    /** Notes and files ZettelFlow created — to Obsidian's trash, never deleted. */
    trash: string[];
    /** Properties to put back as they were. */
    restore: { path: string; before: Record<string, unknown> }[];
    /** Files to move back where they came from. */
    moveBack: { from: string; to: string }[];
    /** Text ZettelFlow appended, to be removed again. */
    unappend: { path: string; text: string }[];
    /** What undo will not touch, and why. */
    blocked: BlockedUndo[];
    /** True only when there is something to do and nothing standing in the way. */
    possible: boolean;
}

/** What the vault looks like right now — the little undo needs to know before it refuses. */
export interface VaultFacts {
    /** `path → mtime`. A path that is absent is a file that is gone. */
    mtimes: Record<string, number>;
    /** `path → current frontmatter`, for checking a property still holds what ZettelFlow left. */
    frontmatter?: Record<string, Record<string, unknown>>;
}

function sameValue(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (left === undefined || right === undefined) return false;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

/** The last moment ZettelFlow itself touched a path — a batch must not block on its own writes. */
function lastTouched(writes: VaultWrite[], path: string): number {
    return Math.max(...writes.filter((write) => write.path === path).map((write) => write.at));
}

/** Turn a batch of writes into everything undoing it would do, and everything it would not. */
export function planUndo(writes: VaultWrite[], facts: VaultFacts): UndoPlan {
    const pending = writes.filter((write) => write.undone === undefined);
    const plan: UndoPlan = {
        trash: [],
        restore: [],
        moveBack: [],
        unappend: [],
        blocked: [],
        possible: false,
    };
    const blockedPaths = new Set<string>();

    const block = (entry: BlockedUndo): void => {
        blockedPaths.add(entry.path);
        if (!plan.blocked.some((existing) => existing.path === entry.path && existing.reason === entry.reason)) {
            plan.blocked.push(entry);
        }
    };

    // First pass: who is out of reach. A note the user edited is out of reach for every write in
    // the batch that touched it, not only the one that noticed.
    for (const write of pending) {
        if (!isUndoableKind(write.kind)) {
            block({ path: write.path, reason: "not-undoable" });
            continue;
        }
        const mtime = facts.mtimes[write.path];
        if (mtime === undefined) continue; // already gone: nothing to take back, and no problem
        if (mtime > lastTouched(pending, write.path) + CHANGED_GRACE_MS) {
            block({ path: write.path, reason: "changed", changedAt: mtime });
        }
    }

    for (const write of pending) {
        if (blockedPaths.has(write.path)) continue;
        const exists = facts.mtimes[write.path] !== undefined;
        switch (write.kind) {
            case "note-created":
            case "file-created":
                if (exists && !plan.trash.includes(write.path)) plan.trash.push(write.path);
                break;
            case "file-moved":
                if (exists && write.from) plan.moveBack.push({ from: write.path, to: write.from });
                break;
            case "content-appended":
                if (exists && write.appended) plan.unappend.push({ path: write.path, text: write.appended });
                break;
            case "properties-set": {
                if (!exists || !write.before) break;
                const current = facts.frontmatter?.[write.path];
                // Only restore what still holds what ZettelFlow left. A key somebody has since
                // changed is theirs now, and overwriting it would be the opposite of an undo.
                const moved = current
                    ? Object.keys(write.after ?? {}).find((key) => !sameValue(current[key], write.after?.[key]))
                    : undefined;
                if (moved) {
                    block({ path: write.path, reason: "property-changed", key: moved });
                    break;
                }
                plan.restore.push({ path: write.path, before: write.before });
                break;
            }
            default:
                break;
        }
    }

    // A path blocked by a later write must not be left half-planned by an earlier one.
    plan.trash = plan.trash.filter((path) => !blockedPaths.has(path));
    plan.restore = plan.restore.filter((entry) => !blockedPaths.has(entry.path));
    plan.moveBack = plan.moveBack.filter((entry) => !blockedPaths.has(entry.from));
    plan.unappend = plan.unappend.filter((entry) => !blockedPaths.has(entry.path));

    const does =
        plan.trash.length + plan.restore.length + plan.moveBack.length + plan.unappend.length;
    plan.possible = does > 0 && plan.blocked.length === 0;
    return plan;
}

/** The counts a preview states before anything happens. */
export interface UndoSummary {
    notes: number;
    properties: number;
    moves: number;
    appends: number;
    blocked: number;
}

export function undoSummary(plan: UndoPlan): UndoSummary {
    return {
        notes: plan.trash.length,
        properties: plan.restore.reduce((total, entry) => total + Object.keys(entry.before).length, 0),
        moves: plan.moveBack.length,
        appends: plan.unappend.length,
        blocked: plan.blocked.length,
    };
}

/** Whether anything at all is left to do — a partial undo's question. */
export function hasWork(plan: UndoPlan): boolean {
    return (
        plan.trash.length + plan.restore.length + plan.moveBack.length + plan.unappend.length > 0
    );
}

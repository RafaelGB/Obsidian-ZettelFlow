/**
 * The Tasks panel, as pure functions (#635). Obsidian already indexes every task — the boundary
 * (`dashboards/base/taskSource.ts`) turns its `listItems` into {@link TaskItem}s — so this module
 * only parses one line, toggles one line, and shapes what the panel shows. No vault, no clock.
 *
 * Only standard Markdown tasks: a list marker (`-`, `*`, `+`, `1.`, `1)`), a `[c]` checkbox, text.
 * A space inside the box is open; any other character is done (Obsidian's own rule).
 */

/** One task, as the panel needs it. */
export interface TaskItem {
    /** The note's vault path. */
    path: string;
    /** 0-based line in the note. */
    line: number;
    /** The character inside the box: `" "` open, anything else done. */
    mark: string;
    /** The task's text, without the list marker or the checkbox. Plain text, never rendered as HTML. */
    text: string;
    /** 0 for a top-level task, 1 for a subtask of a task or list item, and so on. */
    depth: number;
}

export type TaskShow = "open" | "done" | "all";

export interface ParsedTaskLine {
    /** Everything before the box: indentation, marker and the space after it. */
    prefix: string;
    mark: string;
    text: string;
}

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)\](?:\s(.*))?$/;

export function parseTaskLine(line: string): ParsedTaskLine | null {
    const match = TASK_LINE.exec(line);
    if (!match) return null;
    return { prefix: match[1], mark: match[2], text: match[3] ?? "" };
}

export function isOpen(mark: string): boolean {
    return mark === " ";
}

/**
 * The line with its box flipped (`" "` ↔ `"x"`) — or `null` when it is no longer the task the panel
 * showed (different state, different text, not a task at all). Exactly one character changes.
 */
export function toggledLine(line: string, expected: { mark: string; text: string }): string | null {
    const parsed = parseTaskLine(line);
    if (!parsed || parsed.mark !== expected.mark || parsed.text !== expected.text) return null;
    const next = isOpen(parsed.mark) ? "x" : " ";
    const at = parsed.prefix.length;
    return `${line.slice(0, at)}${next}${line.slice(at + 1)}`;
}

export interface ToggledContent {
    /** The whole note, with only that one box changed. */
    content: string;
    /** The toggled line as left (without a CRLF's `\r`). */
    line: string;
    /** The box's new character. */
    mark: string;
}

/**
 * Toggle the task on 0-based `line` of a whole note, or `null` (change nothing) when that line is
 * not the task the panel showed. A CRLF note keeps its `\r`: it sits after the text, outside what
 * the toggle touches, so every other byte of the note is preserved.
 */
export function toggleInContent(
    content: string,
    line: number,
    expected: { mark: string; text: string },
): ToggledContent | null {
    const lines = content.split("\n");
    const current = lines[line];
    if (current === undefined) return null;
    const crlf = current.endsWith("\r");
    const body = crlf ? current.slice(0, -1) : current;
    const next = toggledLine(body, expected);
    if (next === null) return null;
    lines[line] = crlf ? `${next}\r` : next;
    return { content: lines.join("\n"), line: next, mark: isOpen(expected.mark) ? "x" : " " };
}

/**
 * A short fingerprint of a line (FNV-1a, hex) — what the write record keeps instead of the text, so
 * "no note content, ever" holds for a toggled task too.
 */
export function fingerprint(line: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < line.length; i++) {
        hash ^= line.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

export interface TaskGroup {
    path: string;
    tasks: TaskItem[];
}

export interface TaskView {
    open: number;
    done: number;
    /** One group per note when grouping is on; otherwise a single group with an empty path. */
    groups: TaskGroup[];
    /** Matching tasks beyond the render cap. */
    hidden: number;
}

/** A list that renders thousands of rows is a list nobody reads; past this the panel says how many more. */
export const MAX_TASKS_SHOWN = 200;

/**
 * Count, filter and group tasks. `paths` is the order of the notes (the Base's, after transforms);
 * tasks keep their order within a note. The counts are over every task, whatever `show` hides.
 */
export function buildTaskView(
    items: readonly TaskItem[],
    paths: readonly string[],
    options: { show: TaskShow; group: boolean; max?: number },
): TaskView {
    const max = options.max ?? MAX_TASKS_SHOWN;
    let open = 0;
    let done = 0;
    const byPath = new Map<string, TaskItem[]>();
    for (const item of items) {
        if (isOpen(item.mark)) open++;
        else done++;
        const wanted = options.show === "all" || (options.show === "open") === isOpen(item.mark);
        if (!wanted) continue;
        const list = byPath.get(item.path);
        if (list) list.push(item);
        else byPath.set(item.path, [item]);
    }

    const ordered: TaskGroup[] = [];
    for (const path of paths) {
        const tasks = byPath.get(path);
        if (tasks) ordered.push({ path, tasks: [...tasks].sort((a, b) => a.line - b.line) });
    }

    let budget = max;
    let hidden = 0;
    const groups: TaskGroup[] = [];
    for (const group of ordered) {
        const shown = group.tasks.slice(0, Math.max(0, budget));
        hidden += group.tasks.length - shown.length;
        budget -= shown.length;
        if (shown.length > 0) groups.push({ path: group.path, tasks: shown });
    }
    if (!options.group) {
        return { open, done, groups: groups.length > 0 ? [{ path: "", tasks: groups.flatMap((g) => g.tasks) }] : [], hidden };
    }
    return { open, done, groups, hidden };
}

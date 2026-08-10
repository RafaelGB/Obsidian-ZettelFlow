/**
 * Pure string logic for the task-management rollover, extracted so it can be unit-tested without
 * the Obsidian vault. The previous implementation collected unfinished todos only from the
 * section *after* the rollover header but then deleted every unfinished-todo line from the whole
 * file — silently losing todos that lived before the header. This keeps collection and removal in
 * the same scope.
 */

/** A single unfinished todo line, e.g. "- [ ] buy milk" (optionally tab-indented). */
const UNFINISHED_TODO = /\t*- \[ \].*/g;
/** A full unfinished-todo line including its trailing newline, for removal. */
const UNFINISHED_TODO_LINE = /.*\t*- \[ \].*\n?/g;

export interface RolloverResult {
    /** The unfinished todo lines that were rolled over. */
    collected: string[];
    /** The file contents with exactly the collected todos removed. */
    newContents: string;
}

/**
 * Collect the unfinished todos to roll over and return the file contents with only those todos
 * removed.
 *
 * - When `tasksHeader` is present and has content after it, only that trailing section is scanned
 *   and cleaned; everything before the header (including any todos there) is preserved verbatim.
 * - When the header is absent (or empty), the whole file is used, matching the previous fallback.
 */
export function rolloverUnfinishedTodos(contents: string, tasksHeader: string): RolloverResult {
    const parts = tasksHeader ? contents.split(tasksHeader) : [contents];
    const after = parts.length > 1 ? parts.slice(1).join(tasksHeader) : "";
    const hasHeaderSection = parts.length > 1 && after.length > 0;

    const scope = hasHeaderSection ? after : contents;
    const collected = Array.from(scope.matchAll(UNFINISHED_TODO)).map(([todo]) => todo);
    const cleanedScope = scope.split(UNFINISHED_TODO_LINE).join("");
    const newContents = hasHeaderSection ? parts[0] + tasksHeader + cleanedScope : cleanedScope;

    return { collected, newContents };
}

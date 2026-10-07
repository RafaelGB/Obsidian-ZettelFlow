/**
 * The tasks of a Base's notes, read from Obsidian's own index (#635). `metadataCache` already knows
 * every list item, which of them are tasks (`ListItemCache.task`) and on which line — so there is no
 * parser here beyond confirming the line, and a note with no task is never read at all.
 *
 * Reads only. The one write a Tasks panel makes goes through `FileService.toggleTask`.
 */
import { TFile, type ListItemCache } from "obsidian";
import { ObsidianApi } from "architecture";
import { log } from "architecture";
import { parseTaskLine, type TaskItem } from "dashboards/panels";

/** How deep a list item sits: the number of list-item ancestors above it. */
function depthOf(item: ListItemCache, byLine: Map<number, ListItemCache>): number {
    let depth = 0;
    let parent = item.parent;
    // `parent` is the parent item's line, or negative (minus the first line of the list) at the root.
    while (parent >= 0 && depth < 16) {
        const next = byLine.get(parent);
        if (!next) break;
        depth++;
        parent = next.parent;
    }
    return depth;
}

/**
 * A note's tasks, kept until the note changes. A Tasks panel re-reads on every update of its Base —
 * and a Base updates whenever one of its notes does — so without this every edit anywhere in a
 * 300-note Base read all 300 notes again, one after another. The key is what could change the
 * answer: the file (mtime, size) and the task lines Obsidian's index knows (it can be a step behind
 * the file, and catches up without the file changing).
 */
const taskCache = new Map<string, { key: string; tasks: TaskItem[] }>();
/** Enough for any Base; past it the oldest notes are forgotten, never wrong. */
const TASK_CACHE_LIMIT = 5000;
/** Notes read side by side: the reads are I/O, and one at a time was most of the wait. */
const READ_CONCURRENCY = 16;

/** For tests: start from an empty cache. */
export function __resetTaskCache(): void {
    taskCache.clear();
}

async function tasksOf(path: string): Promise<TaskItem[]> {
    const vault = ObsidianApi.vault();
    const cache = ObsidianApi.metadataCache();
    const file = vault.getFileByPath(path);
    if (!(file instanceof TFile)) return [];
    const items = cache.getFileCache(file)?.listItems ?? [];
    const taskItems = items.filter((item) => item.task !== undefined);
    if (taskItems.length === 0) return []; // nothing to show: never read the note

    const lines = taskItems.map((item) => item.position.start.line).join(",");
    const key = `${file.stat?.mtime ?? 0}:${file.stat?.size ?? 0}:${lines}`;
    const kept = taskCache.get(path);
    if (kept && kept.key === key) return kept.tasks;

    const tasks: TaskItem[] = [];
    try {
        const text = (await vault.cachedRead(file)).split("\n");
        const byLine = new Map(items.map((item) => [item.position.start.line, item] as const));
        for (const item of taskItems) {
            const line = item.position.start.line;
            const raw = text[line] ?? "";
            const parsed = parseTaskLine(raw.endsWith("\r") ? raw.slice(0, -1) : raw);
            if (!parsed) continue; // the index is a step behind the file; it will catch up
            tasks.push({ path, line, mark: parsed.mark, text: parsed.text, depth: depthOf(item, byLine) });
        }
    } catch (error) {
        log.warn(`Base dashboard could not read the tasks of ${path}`, error);
        return tasks; // not kept: a note that could not be read is tried again next time
    }
    taskCache.delete(path);
    taskCache.set(path, { key, tasks });
    if (taskCache.size > TASK_CACHE_LIMIT) {
        for (const oldest of taskCache.keys()) {
            taskCache.delete(oldest);
            break;
        }
    }
    return tasks;
}

/** Every task of these notes, in the notes' order — read a few at a time, and each note once. */
export async function readTasks(paths: readonly string[]): Promise<TaskItem[]> {
    const perNote: TaskItem[][] = Array.from({ length: paths.length }, () => []);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < paths.length) {
            const at = next++;
            perNote[at] = await tasksOf(paths[at]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, paths.length) }, worker));
    return perNote.flat();
}

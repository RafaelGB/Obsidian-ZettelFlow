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

export async function readTasks(paths: readonly string[]): Promise<TaskItem[]> {
    const vault = ObsidianApi.vault();
    const cache = ObsidianApi.metadataCache();
    const tasks: TaskItem[] = [];
    for (const path of paths) {
        const file = vault.getFileByPath(path);
        if (!(file instanceof TFile)) continue;
        const items = cache.getFileCache(file)?.listItems ?? [];
        const taskItems = items.filter((item) => item.task !== undefined);
        if (taskItems.length === 0) continue; // nothing to show: never read the note

        try {
            const lines = (await vault.cachedRead(file)).split("\n");
            const byLine = new Map(items.map((item) => [item.position.start.line, item] as const));
            for (const item of taskItems) {
                const line = item.position.start.line;
                const raw = lines[line] ?? "";
                const parsed = parseTaskLine(raw.endsWith("\r") ? raw.slice(0, -1) : raw);
                if (!parsed) continue; // the index is a step behind the file; it will catch up
                tasks.push({ path, line, mark: parsed.mark, text: parsed.text, depth: depthOf(item, byLine) });
            }
        } catch (error) {
            log.warn(`Base dashboard could not read the tasks of ${path}`, error);
        }
    }
    return tasks;
}

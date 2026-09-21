import { log } from "architecture/monitoring/Logger";
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { mergeMocRegion, type MocLink } from "application/notes/mocMerge";

/**
 * The one way a map of content is written (#505, epic #504).
 *
 * There were two. `MocBuilderModal` has done this for a long time, and does it well: the links go
 * into a **machine-managed region** between two markers, so running the map again updates that
 * block and leaves every word you wrote around it untouched. Explore grew its own in #486 — mine,
 * two days old — which wrote a fresh numbered note and could not be re-run, because that
 * sub-issue declared *"a map is a snapshot of a moment"* out of scope **without checking that a
 * re-runnable one already existed three folders away**.
 *
 * So the door I added was the better one and the implementation was the weaker one. This is the
 * implementation that survives, and both doors now come through it.
 *
 * A map is also marked as a **structure note**, which is what tells the rest of the plugin it is
 * scaffolding rather than an idea — the reason a map does not show up as an orphan.
 */

/** Where the map is, and whether it had to be made. */
export interface MapWritten {
    path: string;
    created: boolean;
}

/**
 * Create or update the map at `path`. Never throws — it returns `undefined` and logs, because a
 * failed map must not take the surface that asked for it down with it.
 */
export async function writeMapOfContent(
    path: string,
    links: readonly MocLink[],
    heading: string,
    origin: string
): Promise<MapWritten | undefined> {
    try {
        return await withWriteBatch({ kind: "manual", ref: origin, label: path }, async () => {
            const existing = await FileService.getFile(path, false);
            const members = [...links];

            if (existing === null) {
                const file = await FileService.createFile(path, mergeMocRegion("", members, heading), false);
                await FrontmatterService.instance(file).setProperty(STRUCTURE_NOTE_PROPERTY, true);
                log.info(`[moc] created "${path}" with ${members.length} links`);
                return { path, created: true };
            }

            // The whole point of the managed region: everything outside it is yours.
            const content = await FileService.getContent(existing);
            await FileService.modify(existing, mergeMocRegion(content, members, heading));
            await FrontmatterService.instance(existing).setProperty(STRUCTURE_NOTE_PROPERTY, true);
            log.info(`[moc] updated "${path}" with ${members.length} links`);
            return { path, created: false };
        });
    } catch (error) {
        log.error(`[moc] write failed for "${path}" — ${String(error)}`);
        return undefined;
    }
}

/** Marks a note as scaffolding rather than an idea, so a map is never counted as an orphan. */
export const STRUCTURE_NOTE_PROPERTY = "zettelflowStructureNote";

import { log } from "architecture/monitoring/Logger";
import { FileService } from "architecture/plugin/services/FileService";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { planMapOfContent, uniqueName, type MapRequest } from "application/explore/mapOfContent";

/**
 * Writing the map (#486, epic #481).
 *
 * The pure module decides **what the note says**; this decides **whether it is written**, and it
 * goes through the door every other write in this plugin goes through. That is not a convenience:
 * `FileService` is where the [write record](../../../../docs/architecture/reversibility.md) is
 * taken, so the map shows up in *Recent* and is undoable by batch with no undo code here at all.
 *
 * It never overwrites. A map is a snapshot of a moment, and a second snapshot of the same query is
 * a second note.
 */

export interface CreateMapRequest extends MapRequest {
    /** Where it lands, chosen in the preview. Empty means the vault root. */
    folder: string;
    /** Whether a path is already taken — injected, so the naming rule is testable without a vault. */
    exists: (path: string) => boolean;
}

/** Create the map and return its path, or `undefined` when it could not be written. */
export async function createMapOfContent(request: CreateMapRequest): Promise<string | undefined> {
    const plan = planMapOfContent(request);
    const folder = request.folder.replace(/\/+$/, "");
    const name = uniqueName(plan.name, (candidate) =>
        request.exists(`${folder ? `${folder}/` : ""}${candidate}.md`)
    );
    const path = `${folder ? `${folder}/` : ""}${name}.md`;

    try {
        return await withWriteBatch({ kind: "manual", ref: "map-of-content", label: name }, async () => {
            await FileService.createFile(path, plan.content, true);
            return path;
        });
    } catch (error) {
        log.error("[explore] could not write the map of content", error);
        return undefined;
    }
}

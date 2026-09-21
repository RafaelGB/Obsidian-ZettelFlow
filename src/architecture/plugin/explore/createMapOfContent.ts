import { writeMapOfContent } from "architecture/plugin/notes/writeMapOfContent";
import { mapMembers, type MapRequest } from "application/explore/mapOfContent";

/**
 * Turning an Explore selection into a map of content (#486, rewritten by #505).
 *
 * It used to render its own body — frontmatter, an intro line, a flat list — and write a fresh
 * numbered note each time, because #486 declared *"a map is a snapshot of a moment"* out of
 * scope **without checking that a re-runnable map already existed** in `MocBuilderModal`. It did,
 * and it was better: the links go into a machine-managed region, so running the map again
 * updates that block and leaves everything you wrote around it alone.
 *
 * So this keeps the door — a selection is by far the best way to choose what goes in a map — and
 * gives up the implementation.
 */

export interface CreateMapRequest extends MapRequest {
    /** Where it lands, chosen in the preview. Empty means the vault root. */
    folder: string;
    /** The heading the managed region carries, already localised. */
    heading: string;
}

/** Create or update the map, and return its path. `undefined` when it could not be written. */
export async function createMapOfContent(request: CreateMapRequest): Promise<string | undefined> {
    const folder = request.folder.replace(/\/+$/, "");
    const name = safeMapName(request.name) || "Map of content";
    const path = `${folder ? `${folder}/` : ""}${name}.md`;
    const written = await writeMapOfContent(path, mapMembers(request), request.heading, "explore-map");
    return written?.path;
}

/** Obsidian forbids these in a file name; a selection's description can easily contain them. */
export function safeMapName(name: string): string {
    return name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
}

import type { Idea } from "architecture/knowledge/model/Idea";
import type { MocLink } from "application/notes/mocMerge";

/**
 * **A selection is a place to start** (#486, epic #481) — what a selection puts in a map.
 *
 * A selection is the most concentrated piece of intent the plugin ever holds: you built it click
 * by click, and until #486 it evaporated when you closed the tab. Only the *question* survived,
 * as a saved query — never the thing the question found.
 *
 * This module chose the members and rendered the note. **Since #505 it only chooses the
 * members**: rendering belongs to `mocMerge`, which writes into a machine-managed region so a
 * map can be run again without clobbering the prose around it. #486 shipped a second renderer
 * that could not do that, having put re-running out of scope without checking that a re-runnable
 * map already existed. Two ways to *choose* what goes in a map is fine; two ways to *write* one
 * is the duplication.
 *
 * What is left is deliberately dull: a list of links, in the order the lens showed them.
 * Nothing is summarised, nothing is concluded, nothing is ranked as important — which is what
 * keeps it **mechanical output** under [§XII](../../../docs/development/constitution.md).
 *
 * Pure: no `obsidian`, no vault, no clock of its own.
 */

/**
 * How many notes a map lists. A map of four thousand notes is not a map — and the preview says
 * how many there were, so the cap is a fact you see before you decide, never a silent
 * truncation.
 */
export const MAP_ENTRY_LIMIT = 200;

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

export interface MapRequest {
    matches: readonly Idea[];
    /** The proposed name, already localised. */
    name: string;
}

/**
 * The members of the map, in the lens's order — a map that re-sorted what you were looking at
 * would be answering a question you did not ask.
 */
export function mapMembers(request: Pick<MapRequest, "matches">): MocLink[] {
    return request.matches.slice(0, MAP_ENTRY_LIMIT).map((idea) => ({
        path: idea.path,
        title: basename(idea.path),
    }));
}

/** The selection as wikilinks and nothing else — for the note you are already writing. */
export function asLinks(matches: readonly Idea[]): string {
    return matches.map((idea) => `[[${basename(idea.path)}]]`).join("\n");
}

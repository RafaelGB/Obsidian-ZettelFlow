import type { Idea } from "architecture/knowledge/model/Idea";
import type { RowFact } from "architecture/knowledge/query/answer";

/**
 * **A selection is a place to start** (#486, epic #481) — the note a selection becomes.
 *
 * A selection is the most concentrated piece of intent the plugin ever holds: you built it click
 * by click, and until now it evaporated when you closed the tab. Only the *question* survived, as
 * a saved query — never the thing the question found.
 *
 * A map of content is that thing, written down. It is deliberately dull: a list of links, each
 * carrying the facts your selection asked about, and the query in the frontmatter so the map can
 * be re-run. Nothing is summarised, nothing is concluded, nothing is ranked as important. That is
 * what keeps it **mechanical output** under
 * [§XII](../../../docs/development/constitution.md) — a gathered list needs no accept/reject gate,
 * and the moment it grew a "what these notes have in common" section it would.
 *
 * Storing the query as YAML is the sanctioned direction of
 * [§XIII](../../../docs/development/constitution.md): syntax as an **export format**, which is
 * exactly what a written artefact is.
 *
 * Pure: no `obsidian`, no vault, no clock of its own.
 */

export interface MapPlan {
    /** The file name, without folder or extension. */
    name: string;
    /** The whole file, frontmatter included. */
    content: string;
}

/**
 * How many notes a map lists. A map of four thousand notes is not a map — and the preview says how
 * many there were, so the cap is a fact you see before you decide, never a silent truncation.
 */
export const MAP_ENTRY_LIMIT = 200;

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** Obsidian forbids these in a file name; a selection's description can easily contain them. */
export function safeMapName(name: string): string {
    return name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * A name that is free. Appends ` 2`, ` 3`… rather than overwriting: a map is a snapshot of a
 * moment, and a second snapshot of the same query is a second note, not a replacement.
 */
export function uniqueName(base: string, exists: (name: string) => boolean): string {
    if (!exists(base)) return base;
    for (let n = 2; n < 1000; n++) {
        const candidate = `${base} ${n}`;
        if (!exists(candidate)) return candidate;
    }
    return `${base} ${Date.now()}`;
}

export interface MapRequest {
    matches: readonly Idea[];
    /** The terms that produced the selection; empty when it is the whole vault. */
    terms: readonly string[];
    /** The facts a row carries — the same function the answer uses, so both say the same thing. */
    facts: (idea: Idea) => RowFact[];
    /** How to render one fact as text; the surface owns the wording, this owns the shape. */
    factText: (fact: RowFact) => string;
    /** The proposed name, already localised. */
    name: string;
    /** What the frontmatter key for the query is called, and the line that introduces the list. */
    queryKey: string;
    intro: string;
    /** How the note says it listed only some of them, given the full count. */
    andMore: (hidden: number) => string;
}

/**
 * Compose the note. The order is the lens's order, unchanged — a map that re-sorted what you were
 * looking at would be answering a question you did not ask.
 */
export function planMapOfContent(request: MapRequest): MapPlan {
    const name = safeMapName(request.name) || "Map of content";
    const listed = request.matches.slice(0, MAP_ENTRY_LIMIT);
    const hidden = request.matches.length - listed.length;

    const lines: string[] = ["---"];
    lines.push(`${request.queryKey}: ${JSON.stringify(request.terms.join(" AND "))}`);
    lines.push("---");
    lines.push("");
    lines.push(request.intro);
    lines.push("");
    for (const idea of listed) {
        const facts = request.facts(idea).map(request.factText).join(" · ");
        lines.push(facts ? `- [[${basename(idea.path)}]] — ${facts}` : `- [[${basename(idea.path)}]]`);
    }
    if (hidden > 0) {
        lines.push("");
        lines.push(request.andMore(hidden));
    }
    lines.push("");
    return { name, content: lines.join("\n") };
}

/** The selection as wikilinks and nothing else — for the note you are already writing. */
export function asLinks(matches: readonly Idea[]): string {
    return matches.map((idea) => `[[${basename(idea.path)}]]`).join("\n");
}

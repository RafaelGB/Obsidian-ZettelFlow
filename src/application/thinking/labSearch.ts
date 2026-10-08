import { isHighlight, type Thought } from "./thought";
import { meaningOf, type HighlightMeaning } from "./highlightMeaning";
import { normalise, type ThoughtNode } from "./thread";
import { parseTags } from "./tags";

/**
 * Finding a thought, when you are looking (#596) — pure.
 *
 * The Lab fills up because it asks nothing of you, so it needs a way to *find* — never a way to
 * *file*. This is the retrieval side: search the text you wrote, the `#tags` in it, and the note a
 * thought is about; narrow to the matches; **keep each match's thread intact**; and **never reorder
 * or rank** (a ranking is a judgement, and a queue is a debt — #469). Set-aside thoughts are matched
 * too, and the thoughts themselves are never touched.
 */

export type ThoughtKind = "fork" | "challenge" | "plain";

/** What the find bar is asking for. Every field is optional; an all-empty query narrows nothing. */
export interface LabQuery {
    /** Free text — matches the body (inline `#tags` included) or the subject-note name. */
    text?: string;
    /** Active tag chips — a thought must carry **all** of them (case-insensitive). */
    tags?: string[];
    /** Restrict to fork / challenge / plain thoughts. */
    kind?: ThoughtKind;
    /** Restrict to highlights that mean this (#720); a plain thought never matches. */
    meaning?: HighlightMeaning;
}

export function kindOf(thought: Thought): ThoughtKind {
    if (thought.respondsTo?.as === "challenge") return "challenge";
    if (thought.respondsTo?.as === "fork") return "fork";
    return "plain";
}

const basename = (path: string): string => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

/** A thought's searchable text: its body (with the `#tags` it contains) and its subject-note name. */
function haystack(thought: Thought): string {
    return normalise(`${thought.text} ${thought.about ? basename(thought.about) : ""}`);
}

export function isEmptyQuery(query: LabQuery): boolean {
    return !normalise(query.text ?? "") && !(query.tags && query.tags.length > 0) && !query.kind && !query.meaning;
}

export function matchesThought(thought: Thought, query: LabQuery): boolean {
    const needle = normalise(query.text ?? "");
    if (needle && !haystack(thought).includes(needle)) return false;
    if (query.tags && query.tags.length > 0) {
        const have = new Set(parseTags(thought.text).map((tag) => tag.toLowerCase()));
        if (!query.tags.every((tag) => have.has(tag.toLowerCase()))) return false;
    }
    if (query.kind && kindOf(thought) !== query.kind) return false;
    if (query.meaning && !(isHighlight(thought) && meaningOf(thought) === query.meaning)) return false;
    return true;
}

/**
 * Narrow threads to those matching the query — an ancestor is kept for a matching descendant's sake,
 * so a thread is never a fragment. Never reorders, never ranks. An empty query returns everything.
 */
export function searchThreads(nodes: readonly ThoughtNode[], query: LabQuery): ThoughtNode[] {
    if (isEmptyQuery(query)) return [...nodes];
    return nodes.map((node) => keep(node, query)).filter((node): node is ThoughtNode => node !== undefined);
}

function keep(node: ThoughtNode, query: LabQuery): ThoughtNode | undefined {
    const children = node.children
        .map((child) => keep(child, query))
        .filter((child): child is ThoughtNode => child !== undefined);
    if (children.length > 0) return { ...node, children };
    return matchesThought(node.thought, query) ? { ...node, children: [] } : undefined;
}

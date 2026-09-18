import type { Thought } from "./thought";

/**
 * Thinking reads downward (#467 follow-up, epic #465) — pure.
 *
 * The lab's first list was flat and sorted by clock, so a counterpoint you had just written
 * appeared at the **top**, nowhere near the thought it argued with. That is not a layout problem
 * with a layout fix: fork and challenge were stored as two separate fields, each naming a parent,
 * and nothing in the data said they formed a shape.
 *
 * They do. A thought responds to **at most one** other, which makes the lab a set of threads —
 * and a thread is the thing you actually want to re-read: *I thought this, then I doubted it,
 * then I found the flaw*.
 *
 * Connections (`links`) stay outside the tree on purpose. They are undirected and many, and a
 * graph cannot be nested; they are shown as lateral references instead.
 */

export interface ThoughtNode {
    thought: Thought;
    /** Responses, **oldest first** — a thread is read in the order you wrote it. */
    children: ThoughtNode[];
    /** How deep this sits. The view caps the indent; the number stays honest. */
    depth: number;
}

/**
 * Turn a flat set of thoughts into the threads they already formed.
 *
 * - Roots come **newest first**, because the thread you were just in is the one you want.
 * - Children come **oldest first**, because a conversation reads downward.
 * - A response whose parent is missing becomes a root. **Nothing is ever dropped** — losing a
 *   thought because its parent was thrown away would be the worst thing this surface could do.
 * - A cycle (two thoughts responding to each other, which only a hand-edited file can produce)
 *   is broken by treating the later one as a root, rather than by recursing forever.
 */
export function threadThoughts(thoughts: readonly Thought[]): ThoughtNode[] {
    const byId = new Map(thoughts.map((thought) => [thought.id, thought]));
    const childrenOf = new Map<string, Thought[]>();
    const roots: Thought[] = [];

    for (const thought of thoughts) {
        const parent = thought.respondsTo?.to;
        if (parent === undefined || parent === thought.id || !byId.has(parent) || inCycle(thought, byId)) {
            roots.push(thought);
            continue;
        }
        const siblings = childrenOf.get(parent);
        if (siblings) siblings.push(thought);
        else childrenOf.set(parent, [thought]);
    }

    const build = (thought: Thought, depth: number): ThoughtNode => ({
        thought,
        depth,
        children: [...(childrenOf.get(thought.id) ?? [])]
            .sort((a, b) => a.at - b.at)
            .map((child) => build(child, depth + 1)),
    });

    return [...roots].sort((a, b) => b.at - a.at).map((root) => build(root, 0));
}

/** Whether following this thought's parents comes back around to itself. */
function inCycle(thought: Thought, byId: ReadonlyMap<string, Thought>): boolean {
    const seen = new Set<string>([thought.id]);
    let current = thought.respondsTo?.to;
    while (current !== undefined) {
        if (seen.has(current)) return true;
        seen.add(current);
        current = byId.get(current)?.respondsTo?.to;
    }
    return false;
}

/** Every thought in a thread, the root included — what "throw the whole thread away" would need. */
export function flattenThread(node: ThoughtNode): Thought[] {
    return [node.thought, ...node.children.flatMap(flattenThread)];
}

/** How many thoughts a set of threads holds, for a test that wants to prove nothing was lost. */
export function threadedCount(nodes: readonly ThoughtNode[]): number {
    return nodes.reduce((total, node) => total + flattenThread(node).length, 0);
}

/**
 * Finding your way back in a lab that has grown (#477, epic #472) — pure.
 *
 * The Lab works because it asks nothing of you, which is also what makes it fill up. After a few
 * weeks the thread you want is below the fold, and the refuge is a wall of text.
 *
 * Every obvious fix is the wrong shape. A list of what to process is an inbox. A count is a debt.
 * A ranking of what looks promising is a judgement, and it is yours (§XII). What is actually
 * needed is narrower: **a way to find the thing you are looking for, when you are looking.**
 *
 * So: a filter, empty by default, that narrows and never reorders. A match keeps its thread —
 * an answer without the thought it answers is a fragment — which means an ancestor is kept for
 * its descendant's sake even when it does not match itself.
 */
export function filterThreads(nodes: readonly ThoughtNode[], text: string): ThoughtNode[] {
    const needle = normalise(text);
    if (!needle) return [...nodes];
    return nodes.map((node) => keep(node, needle)).filter((node): node is ThoughtNode => node !== undefined);
}

/** A node survives if it matches, or if anything under it does. */
function keep(node: ThoughtNode, needle: string): ThoughtNode | undefined {
    const children = node.children
        .map((child) => keep(child, needle))
        .filter((child): child is ThoughtNode => child !== undefined);
    if (children.length > 0) return { ...node, children };
    return normalise(node.thought.text).includes(needle) ? { ...node, children: [] } : undefined;
}

/**
 * Case- and accent-insensitive, because you will not remember whether you typed *análisis* or
 * *analisis* at eleven at night.
 */
function normalise(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();
}

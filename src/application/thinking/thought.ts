/**
 * A thought (#466, epic #465) — pure.
 *
 * Every object ZettelFlow has presupposes the thinking already happened. A note wants a title and
 * acquires a lifecycle state; a relation is a judgement already made; a claim has a source. There
 * was nothing for *"I don't know what I'm thinking yet"* — and writing that as a note made it an
 * orphan, put it in Health, and added to your debt. The system asked you to be finished before
 * you had started.
 *
 * A thought asks for **nothing**: no title, no state, no structure, no correctness. It can be
 * three words, a contradiction, or wrong on purpose. The only things it carries are when it was
 * written, what it says, and — optionally — that it came from another thought or argues with one.
 *
 * It is a **file in your vault**, in a folder the system has agreed not to judge, so you can open
 * it, search it and sync it with your own tools. The text is the body, so what Obsidian shows you
 * is exactly what you typed.
 */

/** The frontmatter key a thought's little structure lives under. */
export const LAB_FRONTMATTER_KEY = "zfThought";

/** A plain, untyped connection between two thoughts. It never becomes a semantic relation. */
export interface ThoughtLink {
    to: string;
}

export interface Thought {
    id: string;
    /** Unix ms. The only ordering a thought has. */
    at: number;
    text: string;
    links: ThoughtLink[];
    /** The thought this one went its own way from. */
    forkedFrom?: string;
    /** The thought this one argues with. Neither side is marked right. */
    challenges?: string;
}

export interface NewThought {
    text: string;
    id: string;
    at: number;
    forkedFrom?: string;
    challenges?: string;
}

export function newThought(input: NewThought): Thought {
    return {
        id: input.id,
        at: input.at,
        text: input.text,
        links: [],
        ...(input.forkedFrom ? { forkedFrom: input.forkedFrom } : {}),
        ...(input.challenges ? { challenges: input.challenges } : {}),
    };
}

/**
 * Connect two thoughts, both ways. Neither becomes the other's parent — a connection between two
 * half-formed things has no direction worth recording.
 */
export function linkThoughts(left: Thought, right: Thought): [Thought, Thought] {
    const add = (thought: Thought, other: string): Thought =>
        thought.links.some((link) => link.to === other)
            ? thought
            : { ...thought, links: [...thought.links, { to: other }] };
    return [add(left, right.id), add(right, left.id)];
}

/** Newest first: where you were just working is where you want to be. */
export function orderThoughts(thoughts: readonly Thought[]): Thought[] {
    return [...thoughts].sort((a, b) => b.at - a.at);
}

/** Where a thought's file goes. Named after its id and time, never after a title it does not have. */
export function thoughtPath(folder: string, thought: Thought): string {
    return `${folder}/${thought.at}-${thought.id}.md`;
}

/**
 * The file a thought is.
 *
 * The text is the **body**, not a frontmatter field, so opening it in Obsidian shows what you
 * wrote and nothing else. The structure is minimal and is serialised by hand rather than through
 * a YAML library, because what it holds is three ids and a list of ids.
 */
export function renderThought(thought: Thought): string {
    const lines = [
        "---",
        `${LAB_FRONTMATTER_KEY}:`,
        `  id: ${thought.id}`,
        `  at: ${thought.at}`,
        `  links: [${thought.links.map((link) => link.to).join(", ")}]`,
    ];
    if (thought.forkedFrom) lines.push(`  forkedFrom: ${thought.forkedFrom}`);
    if (thought.challenges) lines.push(`  challenges: ${thought.challenges}`);
    lines.push("---", "", thought.text.replace(/\n+$/, ""), "");
    return lines.join("\n");
}

/**
 * Read a thought back.
 *
 * Anything it cannot understand becomes **just text**, never an error: someone will write a note
 * in this folder by hand, and that is allowed — it is a thought. A refuge that rejects what you
 * put in it is not one.
 */
export function parseThought(content: string, path: string): Thought {
    const fallbackId = path;
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
    if (!match) {
        return { id: fallbackId, at: 0, text: content.trim(), links: [] };
    }
    // Exactly one leading newline: the blank line between frontmatter and body is Obsidian's
    // convention and ours, so it belongs to the format, not to what you wrote.
    const body = content.slice(match[0].length).replace(/^\n/, "").replace(/\n+$/, "");
    const head = match[1];
    const read = (field: string): string | undefined =>
        new RegExp(`^\\s{2}${field}:\\s*(.*)$`, "m").exec(head)?.[1]?.trim();

    const rawLinks = read("links") ?? "";
    const links = rawLinks
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((to) => ({ to }));

    const at = Number(read("at"));
    const forkedFrom = read("forkedFrom");
    const challenges = read("challenges");
    return {
        id: read("id") || fallbackId,
        at: Number.isFinite(at) ? at : 0,
        text: body,
        links,
        ...(forkedFrom ? { forkedFrom } : {}),
        ...(challenges ? { challenges } : {}),
    };
}

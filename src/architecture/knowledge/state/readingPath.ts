import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { communitiesOf } from "architecture/knowledge/map/communities";
import { noteNeighbourhood } from "./neighbourhood";

/**
 * **Reading paths** (#667) — the order the Reader walks your notes in.
 *
 * Pure: a path is an interpretation of the vault for one sitting, built from what the model already
 * knows. It never writes anything, and it needs no MOC: you right-click a note and read from there
 * (#668). R2 (#669) adds the other ways through the same notes — the argument, the story, the
 * essentials, the region — and a selection read in the order its links suggest.
 */

/** What a chapter is to the note you started from, read off the typed relations (#147). */
export type ChapterRole = "thesis" | "support" | "counter" | "synthesis" | "context";

export interface ReadingChapter {
    path: string;
    role: ChapterRole;
}

/** The ways through a note's neighbourhood (#669); `selection` is a set you picked yourself. */
export type ReadingPathKind = "around" | "argument" | "story" | "essentials" | "region" | "selection";

/** The kinds the chooser offers for one note, in the order it offers them. */
export const SEEDED_PATH_KINDS: readonly Exclude<ReadingPathKind, "selection">[] = [
    "around",
    "argument",
    "story",
    "essentials",
    "region",
];

export interface ReadingPath {
    /** The note you chose to read from (a selection's first chapter). */
    seed: string;
    /** How the chapters were chosen. Absent on paths built before R2: read as `around`. */
    kind?: ReadingPathKind;
    chapters: ReadingChapter[];
}

/** A path longer than this stops being a reading and becomes a crawl. */
export const READING_PATH_CAP = 12;

/** A selection or a folder is what you picked: read more of it before calling it a crawl. */
export const SELECTION_CAP = 60;

/** Only notes this connected count as a hub for *Essentials*. */
const HUB_DEGREE = 3;

/** What the impure side knows that the model does not (see the reader's path adapter). */
export interface ReadingPathInputs {
    /** Notes near the seed that it does not link with, best first (the resurface ranking). */
    near?: readonly string[];
    /** When each note was first worked on, if anything recorded it (judgements, moves). */
    firstSeen?: ReadonlyMap<string, number>;
}

/** The relation between the seed and another note, in either direction. */
function relationBetween(model: KnowledgeModel, seed: string, other: string): string | undefined {
    const out = model.get(seed)?.relations.find((relation) => relation.to === other)?.type;
    const back = model.get(other)?.relations.find((relation) => relation.to === seed)?.type;
    if (out === "contradicts" || back === "contradicts") return "contradicts";
    if (out === "supports" || back === "supports") return "supports";
    return out ?? back;
}

function roleOf(relation: string | undefined): ChapterRole {
    if (relation === "supports") return "support";
    if (relation === "contradicts") return "counter";
    return "context";
}

const titleOf = (model: KnowledgeModel, path: string): string => model.get(path)?.title || path;
const byTitle = (model: KnowledgeModel) => (a: string, b: string) =>
    titleOf(model, a).localeCompare(titleOf(model, b), "en") || a.localeCompare(b, "en");

/** The seed, then each other note tagged with its role to the seed. */
function chaptersFrom(model: KnowledgeModel, seed: string, others: readonly string[], cap: number): ReadingChapter[] {
    const rest = others.slice(0, Math.max(0, cap - 1)).map((path) => ({
        path,
        role: roleOf(relationBetween(model, seed, path)),
    }));
    const argued = rest.some((chapter) => chapter.role === "support" || chapter.role === "counter");
    return [{ path: seed, role: argued ? "thesis" : "context" }, ...rest];
}

/** A note on its own — what any path is for a note the model does not know. */
function alone(seed: string, kind: ReadingPathKind): ReadingPath {
    return { seed, kind, chapters: [{ path: seed, role: "context" }] };
}

/**
 * The notes around the seed, best first, without the seed: its neighbours ranked by relation and
 * by whether the link runs both ways (the neighbourhood's own order, #643), then the notes two
 * steps away ranked by how many of those neighbours they touch, then the near-but-unlinked notes.
 */
function aroundOrder(model: KnowledgeModel, seed: string, near: readonly string[], limit: number): string[] {
    const order: string[] = [];
    const seen = new Set<string>([seed]);
    const take = (path: string) => {
        if (order.length >= limit || seen.has(path) || model.get(path) === undefined) return;
        seen.add(path);
        order.push(path);
    };

    const first = noteNeighbourhood(model, seed, []).neighbours.map((n) => n.path);
    first.forEach(take);

    // Two steps away: what the neighbours lead to, counted by how many of them lead there.
    const touches = new Map<string, number>();
    for (const neighbour of first) {
        for (const next of noteNeighbourhood(model, neighbour, []).neighbours) {
            if (seen.has(next.path)) continue;
            touches.set(next.path, (touches.get(next.path) ?? 0) + 1);
        }
    }
    const tie = byTitle(model);
    [...touches.keys()].sort((a, b) => (touches.get(b) ?? 0) - (touches.get(a) ?? 0) || tie(a, b)).forEach(take);

    near.forEach(take);
    return order;
}

/**
 * **Around this note** (#669) — the default reading, and *Read from here*'s first answer.
 *
 * The seed, its neighbours (strongest relation first), then what those neighbours lead to, then the
 * notes near it you never linked. Only notes the model knows: no unresolved links, no attachments,
 * no self-links. At most {@link READING_PATH_CAP} chapters.
 */
export function aroundThisNote(
    model: KnowledgeModel,
    seed: string,
    inputs: ReadingPathInputs = {},
    cap: number = READING_PATH_CAP
): ReadingPath {
    if (!model.get(seed)) return alone(seed, "around");
    return { seed, kind: "around", chapters: chaptersFrom(model, seed, aroundOrder(model, seed, inputs.near ?? [], cap - 1), cap) };
}

/**
 * **Read from here** (#668): the reading the note's menu opens when there is only one way through.
 * Since R2 it is {@link aroundThisNote}; the name stays because `zf.knowledge.readFromHere` uses it.
 */
export function readFromHere(model: KnowledgeModel, seed: string, cap: number = READING_PATH_CAP): ReadingPath {
    return aroundThisNote(model, seed, {}, cap);
}

/**
 * **Argument** (#669): the seed as a thesis, what supports it, what argues back, and the notes that
 * speak to both sides — the synthesis. Offered only when typed relations make it an argument:
 * `null` when nothing supports or contradicts the seed.
 */
export function argumentPath(model: KnowledgeModel, seed: string, cap: number = READING_PATH_CAP): ReadingPath | null {
    if (!model.get(seed)) return null;
    const neighbours = noteNeighbourhood(model, seed, []).neighbours;
    const supports = neighbours.filter((n) => n.cls === "supports").map((n) => n.path);
    const counters = neighbours.filter((n) => n.cls === "contradicts").map((n) => n.path);
    if (supports.length + counters.length === 0) return null;

    const sides = new Set<string>([seed, ...supports, ...counters]);
    const candidates = aroundOrder(model, seed, [], cap * 2).filter((path) => !sides.has(path));
    const synthesis = candidates.filter((path) => {
        let touched = 0;
        for (const n of noteNeighbourhood(model, path, []).neighbours) if (sides.has(n.path)) touched++;
        return touched >= 2;
    });

    const chapters: ReadingChapter[] = [
        { path: seed, role: "thesis" },
        ...supports.map((path) => ({ path, role: "support" as const })),
        ...counters.map((path) => ({ path, role: "counter" as const })),
        ...synthesis.map((path) => ({ path, role: "synthesis" as const })),
    ];
    return { seed, kind: "argument", chapters: chapters.slice(0, cap) };
}

/**
 * **Story of an idea** (#669): the same notes as *around*, in the order you came to them — the
 * first thing recorded about each (a decision, a move), else when it was created. Offered when at
 * least two of them carry a date, so the order actually says something.
 */
export function storyPath(
    model: KnowledgeModel,
    seed: string,
    inputs: ReadingPathInputs = {},
    cap: number = READING_PATH_CAP
): ReadingPath | null {
    const around = aroundThisNote(model, seed, inputs, cap);
    if (around.chapters.length < 3) return null;
    const when = (path: string) => {
        const seen = inputs.firstSeen?.get(path);
        const created = model.get(path)?.created ?? 0;
        const candidates = [seen, created > 0 ? created : undefined].filter((v): v is number => v !== undefined && v > 0);
        return candidates.length > 0 ? Math.min(...candidates) : 0;
    };
    const dated = around.chapters.filter((chapter) => when(chapter.path) > 0);
    if (new Set(dated.map((chapter) => when(chapter.path))).size < 2) return null;
    const tie = byTitle(model);
    const chapters = [...around.chapters].sort((a, b) => {
        const wa = when(a.path) || Number.MAX_SAFE_INTEGER;
        const wb = when(b.path) || Number.MAX_SAFE_INTEGER;
        return wa - wb || tie(a.path, b.path);
    });
    return { seed, kind: "story", chapters };
}

/**
 * **Essentials** (#669): only the notes everything else leans on — the seed and the hubs around
 * it, most connected first. Offered when it actually leaves something out and still reads as a
 * path (three chapters or more).
 */
export function essentialsPath(model: KnowledgeModel, seed: string, inputs: ReadingPathInputs = {}): ReadingPath | null {
    if (!model.get(seed)) return null;
    const candidates = aroundOrder(model, seed, inputs.near ?? [], READING_PATH_CAP * 2);
    const degree = (path: string) => model.get(path)?.maturitySignals.degree ?? 0;
    const tie = byTitle(model);
    const hubs = candidates.filter((path) => degree(path) >= HUB_DEGREE).sort((a, b) => degree(b) - degree(a) || tie(a, b));
    const chapters = chaptersFrom(model, seed, hubs, 7);
    if (chapters.length < 3 || chapters.length - 1 >= candidates.length) return null;
    return { seed, kind: "essentials", chapters };
}

/**
 * **Region** (#669): the seed's community in the graph (#524) — the notes that link to each other
 * far more than to the rest. The seed, then the community's hub, then its members by how connected
 * they are. Offered when the community has three notes or more and is not just the seed's
 * immediate neighbours again.
 */
export function regionPath(model: KnowledgeModel, seed: string, cap: number = READING_PATH_CAP): ReadingPath | null {
    if (!model.get(seed)) return null;
    const community = communitiesOf(model).find((c) => c.hub === seed || c.members.includes(seed));
    if (!community) return null;
    const all = [community.hub, ...community.members];
    if (all.length < 3) return null;
    const neighbours = new Set(noteNeighbourhood(model, seed, []).neighbours.map((n) => n.path));
    if (all.every((path) => path === seed || neighbours.has(path))) return null;

    const degree = (path: string) => model.get(path)?.maturitySignals.degree ?? 0;
    const tie = byTitle(model);
    const rest = all
        .filter((path) => path !== seed && path !== community.hub)
        .sort((a, b) => degree(b) - degree(a) || tie(a, b));
    const ordered = community.hub === seed ? rest : [community.hub, ...rest];
    return { seed, kind: "region", chapters: chaptersFrom(model, seed, ordered, cap) };
}

/** One way through a note, ready for the chooser: what it is and the chapters it would read. */
export interface ReadingPathOption {
    kind: Exclude<ReadingPathKind, "selection">;
    path: ReadingPath;
}

/**
 * The ways through a note that say something (#669) — *around* always, the others only when the
 * vault gives them substance, and never two that read the same notes in the same order.
 */
export function readingPathOptions(model: KnowledgeModel, seed: string, inputs: ReadingPathInputs = {}): ReadingPathOption[] {
    const candidates: (ReadingPathOption | null)[] = [
        { kind: "around", path: aroundThisNote(model, seed, inputs) },
        wrap("argument", argumentPath(model, seed)),
        wrap("story", storyPath(model, seed, inputs)),
        wrap("essentials", essentialsPath(model, seed, inputs)),
        wrap("region", regionPath(model, seed)),
    ];
    const options: ReadingPathOption[] = [];
    const signatures = new Set<string>();
    for (const option of candidates) {
        if (!option) continue;
        const signature = option.path.chapters.map((chapter) => chapter.path).join("\n");
        if (signatures.has(signature)) continue;
        signatures.add(signature);
        options.push(option);
    }
    return options;
}

function wrap(kind: ReadingPathOption["kind"], path: ReadingPath | null): ReadingPathOption | null {
    return path ? { kind, path } : null;
}

/** Build one kind of path for a note — the Reader rebuilds the one it was opened with. */
export function readingPathOf(
    model: KnowledgeModel,
    seed: string,
    kind: Exclude<ReadingPathKind, "selection">,
    inputs: ReadingPathInputs = {}
): ReadingPath {
    switch (kind) {
        case "argument":
            return argumentPath(model, seed) ?? aroundThisNote(model, seed, inputs);
        case "story":
            return storyPath(model, seed, inputs) ?? aroundThisNote(model, seed, inputs);
        case "essentials":
            return essentialsPath(model, seed, inputs) ?? aroundThisNote(model, seed, inputs);
        case "region":
            return regionPath(model, seed) ?? aroundThisNote(model, seed, inputs);
        case "around":
        default:
            return aroundThisNote(model, seed, inputs);
    }
}

/**
 * **Read these** (#669): notes you picked — a multi-selection, a folder, an Explore selection —
 * read in the order their links suggest. It starts at the note that leads most into the rest, then
 * follows the strongest link to a note not read yet; when the links run out, it takes the unread
 * note most connected to what has been read. Notes the model does not know are left out; a set of
 * none reads as nothing (`null`).
 */
export function selectionPath(model: KnowledgeModel, paths: readonly string[], cap: number = SELECTION_CAP): ReadingPath | null {
    const picked = [...new Set(paths)].filter((path) => model.get(path) !== undefined);
    if (picked.length === 0) return null;
    const inSet = new Set(picked);
    const tie = byTitle(model);
    const linksOf = (path: string) => noteNeighbourhood(model, path, []).neighbours.filter((n) => inSet.has(n.path));

    const lead = (path: string) => {
        let score = 0;
        for (const n of linksOf(path)) score += (n.outbound ? 1 : 0) - (n.inbound ? 1 : 0);
        return score;
    };
    const start = [...picked].sort((a, b) => lead(b) - lead(a) || tie(a, b))[0];

    const order: string[] = [start];
    const read = new Set<string>([start]);
    while (order.length < Math.min(cap, picked.length)) {
        const current = order[order.length - 1];
        const next = linksOf(current).find((n) => !read.has(n.path))?.path;
        const fallback = () => {
            const unread = picked.filter((path) => !read.has(path));
            const touching = (path: string) => linksOf(path).filter((n) => read.has(n.path)).length;
            return unread.sort((a, b) => touching(b) - touching(a) || tie(a, b))[0];
        };
        const chosen = next ?? fallback();
        order.push(chosen);
        read.add(chosen);
    }
    return { seed: start, kind: "selection", chapters: chaptersFrom(model, start, order.slice(1), cap) };
}

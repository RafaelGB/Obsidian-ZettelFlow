import type { LabMove } from "./labKeys";

/**
 * **The move is the object** (#490, epic #489) — the vocabulary of thinking, and nothing else.
 *
 * ZettelFlow records what you *have*: notes, states, links, claims, verdicts, and since 3.6 every
 * write it made on your behalf. It records nothing about what you *did* — the operation that
 * changed your mind. A note is a photograph of a state of thinking; the thinking is the sequence
 * of moves that got it there, and until now that sequence was thrown away as it happened.
 *
 * The vocabulary already half-existed, one surface down: `labKeys.ts` declares a type called
 * `LabMove`, binds each entry to a key, and discards every one the moment it fires. This module
 * does not invent a layer on top of the product. It notices that those were always moves, names
 * the five kinds they belong to, and gives them a genealogy.
 *
 * **Five primitives, eleven verbs, and not one more.** The obvious design here is a vocabulary of
 * thirty operations — split, merge, compress, expand, abstract, concretize, invert, steelman,
 * falsify. That is the failure mode, and this repo already paid for the lesson: epic #465 shipped
 * only after cutting fifteen concepts to five. A capability whose only authoring path is picking
 * from a thirty-item menu is a capability nobody finds
 * ([§XIII](../../../docs/development/constitution.md) wearing a different hat). The guardrail on
 * the table below is what makes a twelfth verb a conversation instead of a commit.
 *
 * Pure: no `obsidian`, no clock, no I/O. The log that persists these lives in #491.
 */

/** The five kinds of thing you can do to an idea. */
export type MovePrimitive = "externalize" | "transform" | "perturb" | "explore" | "crystallize";

export const MOVE_PRIMITIVES: readonly MovePrimitive[] = [
    "externalize",
    "transform",
    "perturb",
    "explore",
    "crystallize",
];

/** A named operation, and the primitive it belongs to. */
export interface MoveVerb {
    /** Stable, locale-free id. Persisted, so it may never be renamed. */
    verb: string;
    primitive: MovePrimitive;
    /** i18n key of its name; derived, so a verb cannot exist without one. */
    labelKey: string;
}

/**
 * Label keys are written out rather than derived from the verb. Deriving them was neater and
 * wrong: the locale guardrail (#320) scans the source for every key it can find, and a key built
 * by string arithmetic is invisible to it — so eleven real strings looked like eleven orphans.
 * A greppable literal is worth more than a clever one.
 */
function verb(verb: string, primitive: MovePrimitive, labelKey: string): MoveVerb {
    return { verb, primitive, labelKey };
}

/**
 * The whole vocabulary. At most three verbs per primitive, on purpose.
 *
 * | Primitive | Verbs | What it means |
 * |---|---|---|
 * | externalize | capture | it came out of your head |
 * | transform | split · compress · reframe | the same idea, in another shape |
 * | perturb | challenge · counterexample · invert | put it under pressure |
 * | explore | branch · analogy · set aside | move through possibility |
 * | crystallize | crystallize | it has enough shape to be knowledge |
 */
export const MOVE_VERBS: readonly MoveVerb[] = [
    verb("capture", "externalize", "move_verb_capture"),
    verb("split", "transform", "move_verb_split"),
    verb("compress", "transform", "move_verb_compress"),
    verb("reframe", "transform", "move_verb_reframe"),
    verb("challenge", "perturb", "move_verb_challenge"),
    verb("counterexample", "perturb", "move_verb_counterexample"),
    verb("invert", "perturb", "move_verb_invert"),
    verb("branch", "explore", "move_verb_branch"),
    verb("analogy", "explore", "move_verb_analogy"),
    verb("set-aside", "explore", "move_verb_set_aside"),
    verb("crystallize", "crystallize", "move_verb_crystallize"),
];

/**
 * One thing you did, to one thing.
 *
 * What it holds is deliberately thin, and for the same reason `Judgement` is: a record that could
 * hold note bodies would be a second copy of your vault with none of its protections. The subject
 * is a **reference** — a vault path or a thought id — never content.
 */
export interface Move {
    id: string;
    /** Unix ms. */
    at: number;
    primitive: MovePrimitive;
    /** One of {@link MOVE_VERBS}. */
    verb: string;
    /**
     * What it acted on: a vault path, or a thought id. Two namespaces in one field, deliberately
     * — a uuid and a path cannot collide, and a discriminator nobody reads is a field nobody
     * maintains.
     */
    subject: string;
    /** For `crystallize`: the note the thinking became, so the genealogy crosses into knowledge. */
    produced?: string;
    /** The move this came out of. Present, a branch has a lineage; absent, it is a root. */
    from?: string;
    /**
     * One line, optional, never asked for. The single piece of free text in the record, and the
     * reason a replay reads as a story rather than a list of verbs.
     */
    because?: string;
}

/** A line, not a paragraph. Same limit a frozen quote already uses in the Lab. */
export const BECAUSE_LIMIT = 140;

/** Validate and normalise. The id and the clock come from the caller, which is what keeps this pure. */
export function newMove(facts: Move): Move {
    const move: Move = {
        id: facts.id,
        at: facts.at,
        primitive: facts.primitive,
        verb: facts.verb,
        subject: facts.subject,
    };
    if (facts.produced) move.produced = facts.produced;
    if (facts.from) move.from = facts.from;
    const because = facts.because?.trim();
    if (because) move.because = because.slice(0, BECAUSE_LIMIT);
    return move;
}

/**
 * The chain of moves this one came out of, nearest first, root last.
 *
 * Cycle-safe: a corrupt `from` can point a move at itself or around a loop, and a walk that trusts
 * the data hangs the renderer. Same visited-set shape the Lab's threading already uses.
 */
export function ancestorsOf(id: string, all: readonly Move[]): Move[] {
    const byId = new Map(all.map((move) => [move.id, move]));
    const seen = new Set<string>([id]);
    const chain: Move[] = [];
    let current = byId.get(id)?.from;
    while (current && !seen.has(current)) {
        seen.add(current);
        const parent = byId.get(current);
        if (!parent) break;
        chain.push(parent);
        current = parent.from;
    }
    return chain;
}

/** What came out of a move — the branches, newest first. */
export function childrenOf(id: string, all: readonly Move[]): Move[] {
    return all.filter((move) => move.from === id).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
}

/** One subject's history, oldest first — the order a replay reads in. */
export function movesFor(subject: string, all: readonly Move[]): Move[] {
    return all.filter((move) => move.subject === subject || move.produced === subject).sort(byTime);
}

function byTime(a: Move, b: Move): number {
    return a.at - b.at || a.id.localeCompare(b.id);
}

/**
 * How many moves one subject keeps — its genealogy, not the whole history. Fifty is well past
 * what any one idea accumulates, and the point of the limit is that a runaway subject cannot
 * push everything else out.
 */
export const MOVES_PER_SUBJECT = 50;

/** The safety net for `data.json`. A move is about 120 bytes, so this is a quarter of a megabyte. */
export const MOVE_CEILING = 2000;

export interface MoveLimits {
    /** How many moves one subject keeps. Its genealogy, not the global history. */
    perSubject: number;
    /** The safety net for `data.json`, applied after. */
    ceiling: number;
}

/**
 * Bound the log **per subject first, then globally**.
 *
 * The order matters and the naive version is wrong: a global cap applied first destroys the whole
 * history of an idea you thought about once to make room for one you thought about all week. Every
 * subject keeps its own recent past; only then does the ceiling take the oldest, wherever they are.
 *
 * Not by clock, unlike the write record — that expires in a week because it carries values to
 * restore, and a move log that expires destroys the thing it exists for.
 */
export function pruneMoves(all: readonly Move[], { perSubject, ceiling }: MoveLimits): Move[] {
    const bySubject = new Map<string, Move[]>();
    for (const move of [...all].sort(byTime)) {
        const kept = bySubject.get(move.subject);
        if (kept) kept.push(move);
        else bySubject.set(move.subject, [move]);
    }
    const kept: Move[] = [];
    for (const moves of bySubject.values()) kept.push(...moves.slice(-perSubject));
    kept.sort(byTime);
    return kept.length > ceiling ? kept.slice(kept.length - ceiling) : kept;
}

/**
 * What each of the Lab's existing moves *is*, in the vocabulary.
 *
 * An exhaustive `Record` over the union, deliberately: a new `LabMove` will not compile until
 * someone decides what kind of thinking it is — **including deciding that it is not any**, which
 * `null` says out loud rather than by omission.
 */
export const LAB_MOVE_VOCABULARY: Record<LabMove, { primitive: MovePrimitive; verb: string } | null> = {
    fork: { primitive: "explore", verb: "branch" },
    challenge: { primitive: "perturb", verb: "challenge" },
    setAside: { primitive: "explore", verb: "set-aside" },
    // Deciding against something is still setting it aside; *why* lives on the thought, not here.
    decidedAgainst: { primitive: "explore", verb: "set-aside" },
    crystallize: { primitive: "crystallize", verb: "crystallize" },
    // `connect` belongs to the relation vocabulary (#147), which already owns that act; giving it
    // a second home would be two places for one thing.
    connect: null,
    // Selecting, deleting and navigating are not acts of thinking. Discarding in particular is the
    // absence of a move rather than one.
    pick: null,
    discard: null,
    next: null,
    previous: null,
    leave: null,
};

const PRIMITIVES = new Set<string>(MOVE_PRIMITIVES);
const VERBS = new Map(MOVE_VERBS.map((entry) => [entry.verb, entry.primitive]));

function looksLikeMove(value: unknown): value is Move {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<Move>;
    if (typeof candidate.id !== "string" || candidate.id === "") return false;
    if (typeof candidate.at !== "number" || !Number.isFinite(candidate.at)) return false;
    if (typeof candidate.subject !== "string" || candidate.subject === "") return false;
    if (typeof candidate.primitive !== "string" || !PRIMITIVES.has(candidate.primitive)) return false;
    if (typeof candidate.verb !== "string") return false;
    // A verb must belong to the primitive it claims: a log written by a newer release, or edited
    // by hand, must not be able to smuggle a vocabulary the interface cannot name.
    return VERBS.get(candidate.verb) === candidate.primitive;
}

/**
 * Read a persisted log back safely.
 *
 * Everything is rebuilt through {@link newMove}, which is what drops a field the type never
 * declared — so a body cannot arrive from disk even if something wrote one there. A corrupt blob
 * costs you the log rather than the plugin, and a hostile member is skipped rather than thrown on.
 */
export function sanitizeMoveLog(raw: unknown): Move[] {
    if (!Array.isArray(raw)) return [];
    const out: Move[] = [];
    for (const value of raw) {
        try {
            if (looksLikeMove(value)) out.push(newMove(value));
        } catch {
            // A getter that throws, a Symbol, a proxy: skip it and keep the rest.
        }
    }
    return out;
}

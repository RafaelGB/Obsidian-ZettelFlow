import { describe, it, expect } from "@jest/globals";
import {
    ancestorsOf,
    BECAUSE_LIMIT,
    childrenOf,
    LAB_MOVE_VOCABULARY,
    MOVE_PRIMITIVES,
    MOVE_VERBS,
    movesFor,
    newMove,
    pruneMoves,
    MOVE_APPLICABILITY,
    verbsFor,
    effectOf,
    type Move,
} from "application/thinking/move";
import { LAB_KEYS } from "application/thinking/labKeys";

/**
 * **The five moves, and the eleven verbs** (#490, epic #489).
 *
 * The vocabulary is the whole issue, and two of its rules are easy to get subtly wrong: a
 * genealogy that hangs on a corrupt parent, and a retention rule that quietly destroys the
 * history of a quiet subject to make room for a noisy one.
 */

const move = (over: Partial<Move> = {}): Move =>
    newMove({ id: "m1", at: 1_000, primitive: "perturb", verb: "challenge", subject: "a.md", ...over });

describe("five primitives, eleven verbs, and not one more (#490)", () => {
    it("holds exactly that, with every verb in exactly one primitive", () => {
        expect(MOVE_PRIMITIVES).toHaveLength(5);
        expect(MOVE_VERBS).toHaveLength(11);
        for (const entry of MOVE_VERBS) expect(MOVE_PRIMITIVES).toContain(entry.primitive);
        expect(new Set(MOVE_VERBS.map((v) => v.verb)).size).toBe(11);
    });

    it("gives every verb a label key, so the interface never invents a name", () => {
        for (const entry of MOVE_VERBS) expect(entry.labelKey).toBe(`move_verb_${entry.verb.replace(/-/g, "_")}`);
    });
});

describe("a move carries what you did, never what it said (#490)", () => {
    it("has no field a note body could live in", () => {
        expect(Object.keys(move({ from: "m0", because: "why", produced: "n.md" })).sort()).toEqual([
            "at",
            "because",
            "from",
            "id",
            "primitive",
            "produced",
            "subject",
            "verb",
        ]);
    });

    it("caps the one line of free text rather than refusing it", () => {
        const long = "x".repeat(400);
        expect(move({ because: long }).because).toHaveLength(BECAUSE_LIMIT);
    });

    it("omits a blank reason entirely", () => {
        expect(move({ because: "   " })).not.toHaveProperty("because");
        expect(move()).not.toHaveProperty("because");
    });
});

describe("the genealogy builds itself, and survives a corrupt one (#490)", () => {
    const chain: Move[] = [
        move({ id: "m1", at: 1 }),
        move({ id: "m2", at: 2, from: "m1" }),
        move({ id: "m3", at: 3, from: "m2" }),
        move({ id: "m4", at: 4, from: "m3" }),
    ];

    it("resolves a chain to its root, root last", () => {
        expect(ancestorsOf("m4", chain).map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
    });

    it("terminates on a move that points at itself", () => {
        const loop = [move({ id: "x", from: "x" })];
        expect(ancestorsOf("x", loop)).toEqual([]);
    });

    it("terminates on a two-move loop", () => {
        const loop = [move({ id: "a", from: "b" }), move({ id: "b", from: "a" })];
        expect(ancestorsOf("a", loop).map((m) => m.id)).toEqual(["b"]);
    });

    it("finds what came out of a move, newest first", () => {
        const branched = [
            move({ id: "r", at: 1 }),
            move({ id: "c1", at: 2, from: "r" }),
            move({ id: "c2", at: 3, from: "r" }),
        ];
        expect(childrenOf("r", branched).map((m) => m.id)).toEqual(["c2", "c1"]);
    });
});

describe("retention is per subject, not per clock (#490)", () => {
    const many = (subject: string, count: number, from = 0): Move[] =>
        Array.from({ length: count }, (_, n) => move({ id: `${subject}-${n}`, at: from + n, subject }));

    it("keeps a quiet subject whole while cutting a noisy one", () => {
        const all = [...many("a.md", 40), ...many("b.md", 3, 100)];
        const kept = pruneMoves(all, { perSubject: 20, ceiling: 1000 });
        expect(kept.filter((m) => m.subject === "a.md")).toHaveLength(20);
        expect(kept.filter((m) => m.subject === "b.md")).toHaveLength(3);
        expect(kept).toHaveLength(23);
    });

    it("keeps the newest of a subject, not the first it saw", () => {
        const kept = pruneMoves(many("a.md", 5), { perSubject: 2, ceiling: 1000 });
        expect(kept.map((m) => m.id)).toEqual(["a.md-3", "a.md-4"]);
    });

    it("applies the global ceiling oldest-first, across subjects", () => {
        const all = [...many("a.md", 5), ...many("b.md", 5, 100)];
        const kept = pruneMoves(all, { perSubject: 20, ceiling: 4 });
        expect(kept).toHaveLength(4);
        expect(kept.every((m) => m.subject === "b.md")).toBe(true);
    });

    it("returns them in a deterministic order whatever order they arrived in", () => {
        const all = [...many("a.md", 3)];
        expect(pruneMoves([...all].reverse(), { perSubject: 20, ceiling: 100 })).toEqual(
            pruneMoves(all, { perSubject: 20, ceiling: 100 })
        );
    });
});

describe("what the Lab already does, named (#490)", () => {
    it("decides for every Lab move whether it is thinking", () => {
        // An exhaustive Record over the union: a new Lab move will not compile until someone
        // says what kind of thinking it is — including saying that it is not any.
        for (const { move: labMove } of LAB_KEYS) {
            expect(LAB_MOVE_VOCABULARY).toHaveProperty(labMove);
        }
        expect(LAB_MOVE_VOCABULARY.fork).toEqual({ primitive: "explore", verb: "branch" });
        expect(LAB_MOVE_VOCABULARY.challenge).toEqual({ primitive: "perturb", verb: "challenge" });
        expect(LAB_MOVE_VOCABULARY.setAside).toEqual({ primitive: "explore", verb: "set-aside" });
        expect(LAB_MOVE_VOCABULARY.crystallize).toEqual({ primitive: "crystallize", verb: "crystallize" });
    });

    it("says plainly which Lab moves are not acts of thinking", () => {
        // Navigating is not thinking; discarding is the absence of a move rather than one; and
        // `connect` belongs to the relation vocabulary (#147), which already owns that act.
        for (const labMove of ["next", "previous", "leave", "discard", "pick", "connect"] as const) {
            expect(LAB_MOVE_VOCABULARY[labMove]).toBeNull();
        }
    });
});

describe("reading a subject's history (#490)", () => {
    it("returns only that subject's moves, oldest first", () => {
        const all = [move({ id: "1", at: 2, subject: "a.md" }), move({ id: "2", at: 1, subject: "b.md" }), move({ id: "3", at: 3, subject: "a.md" })];
        expect(movesFor("a.md", all).map((m) => m.id)).toEqual(["1", "3"]);
    });
});

describe("the vocabulary knows what it acts on (#498)", () => {
    it("answers for every verb, and only for verbs", () => {
        // Asserted in both directions: the compile-time claim (a twelfth verb will not build
        // until it has an answer) cannot be checked at runtime, so the key sets are.
        expect(Object.keys(MOVE_APPLICABILITY).sort()).toEqual(MOVE_VERBS.map((v) => v.verb).sort());
        for (const row of Object.values(MOVE_APPLICABILITY)) {
            expect(Object.keys(row).sort()).toEqual(["note", "thought"]);
        }
    });

    it("stops offering what means nothing where", () => {
        const onNote = verbsFor("note").map((v) => v.verb);
        expect(onNote).not.toContain("capture"); // already captured
        expect(onNote).not.toContain("crystallize"); // already knowledge
        expect(verbsFor("thought").map((v) => v.verb)).not.toContain("split"); // no headings
    });

    it("says what choosing it does", () => {
        expect(effectOf("split", "note")).toBe("operation");
        expect(effectOf("challenge", "note")).toBe("space");
        expect(effectOf("set-aside", "note")).toBe("record");
        expect(effectOf("crystallize", "note")).toBeNull();
    });

    it("answers nothing for a verb it has never heard of, rather than crashing", () => {
        // It is called with what came off disk, where the verb is whatever was written there.
        expect(effectOf("steelman", "note")).toBeNull();
    });

    it("agrees with the Lab about what a thought can have done to it", () => {
        // Without this the thought column would be decoration: nothing reads it yet. A fifth Lab
        // gesture now forces an answer here too.
        for (const [labMove, mapped] of Object.entries(LAB_MOVE_VOCABULARY)) {
            if (!mapped) continue;
            expect({ labMove, effect: effectOf(mapped.verb, "thought") }).toEqual({
                labMove,
                effect: expect.any(String),
            });
        }
    });
});

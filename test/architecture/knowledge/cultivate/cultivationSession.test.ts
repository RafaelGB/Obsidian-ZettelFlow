import { describe, it, expect } from "@jest/globals";
import {
    buildCultivationSession,
    selectCultivationTarget,
    readyToCultivate,
    cultivationQueue,
    stageDistribution,
} from "architecture/knowledge/cultivate/cultivationSession";
import { LIFECYCLE_STATES } from "architecture/knowledge/lifecycle/states";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const NOW = 1_000_000_000_000;

// a → b (link) and a → x (contradicts); d → b so a and d are coupled via b (an unlinked related pair).
const model = buildModel([
    idea("a.md", "permanent", [{ to: "b.md" }, { to: "x.md", type: "contradicts" }]),
    idea("b.md", "permanent", []),
    idea("x.md", "permanent", []),
    idea("d.md", "permanent", [{ to: "b.md" }]),
]);

describe("buildCultivationSession (#309 S1)", () => {
    it("composes the per-note moves in ritual order", () => {
        const session = buildCultivationSession(model, "a.md", NOW);
        expect(session).not.toBeNull();
        expect(session!.state).toBe("permanent");
        expect(session!.degree).toBe(2);
        expect(typeof session!.maturity).toBe("number");
        expect(session!.moves.map((m) => m.kind)).toEqual(["connect", "challenge", "question", "advance", "source"]);

        const connect = session!.moves.find((m) => m.kind === "connect");
        expect(connect?.candidates).toContain("d.md"); // coupled via b, not yet linked
        expect(connect?.candidates).not.toContain("b.md"); // already linked

        const challenge = session!.moves.find((m) => m.kind === "challenge");
        expect(challenge?.candidates).toEqual(["x.md"]);

        const advance = session!.moves.find((m) => m.kind === "advance");
        expect(advance?.proposedState).toBe("developing"); // permanent → developing (first non-archived)
    });

    it("omits the source move for a sourced note; challenge is still offered without contradictions", () => {
        const m = buildModel([
            idea("solo.md", "fleeting", [], { hasSources: true }),
            idea("other.md", "fleeting", []),
        ]);
        const session = buildCultivationSession(m, "solo.md", NOW);
        const kinds = session!.moves.map((mv) => mv.kind);
        expect(kinds).not.toContain("source");
        expect(kinds).toContain("challenge");
        expect(session!.moves.find((mv) => mv.kind === "challenge")?.candidates).toEqual([]);
        // fleeting → literature is the first allowed advance
        expect(session!.moves.find((mv) => mv.kind === "advance")?.proposedState).toBe("literature");
    });

    it("returns null for an unknown path", () => {
        expect(buildCultivationSession(model, "missing.md", NOW)).toBeNull();
    });

    it("honors a recipe — only the enabled moves appear, in canonical order (#318 S1)", () => {
        const only = buildCultivationSession(model, "a.md", NOW, ["question", "advance"]);
        expect(only!.moves.map((m) => m.kind)).toEqual(["question", "advance"]);
        // an empty recipe falls back to the full ritual
        const full = buildCultivationSession(model, "a.md", NOW, []);
        expect(full!.moves.map((m) => m.kind)).toEqual(["connect", "challenge", "question", "advance", "source"]);
    });
});

describe("cultivationQueue (#318 S2)", () => {
    it("returns the ranked queue, honoring limit and exclude", () => {
        const q = cultivationQueue(model, new Set(), 2);
        expect(q.length).toBe(2);
        for (const p of q) expect(model.get(p)).toBeDefined();
        const target = selectCultivationTarget(model)!;
        expect(cultivationQueue(model, new Set([target]))).not.toContain(target);
    });
});

describe("selectCultivationTarget (#309 S1)", () => {
    it("picks a real note (highest-leverage) and null for an empty model", () => {
        const target = selectCultivationTarget(model);
        expect(target).not.toBeNull();
        expect(model.get(target!)).toBeDefined();
        expect(selectCultivationTarget(buildModel([]))).toBeNull();
    });
});

describe("embryonic-first ordering (#589, FR-1 / AC-1)", () => {
    // f1 fleeting deg 0 · f2 fleeting deg 1 · lit literature deg 2 · p1 permanent deg 1
    const staged = buildModel([
        idea("f1.md", "fleeting", []),
        idea("f2.md", "fleeting", [{ to: "lit.md" }]),
        idea("lit.md", "literature", [{ to: "p1.md" }]),
        idea("p1.md", "permanent", []),
    ]);

    it("selects the most-embryonic note, highest-degree within the stage", () => {
        expect(selectCultivationTarget(staged)).toBe("f2.md");
    });

    it("orders the whole queue by lifecycle stage ascending, then -degree then path", () => {
        expect(cultivationQueue(staged, new Set(), 99)).toEqual(["f2.md", "f1.md", "lit.md", "p1.md"]);
    });

    it("is deterministic across calls", () => {
        expect(cultivationQueue(staged, new Set(), 99)).toEqual(cultivationQueue(staged, new Set(), 99));
    });
});

describe("a chosen stage restricts the session (#589, FR-2 / AC-2 / AC-4)", () => {
    const staged = buildModel([
        idea("f1.md", "fleeting", []),
        idea("f2.md", "fleeting", [{ to: "lit.md" }]),
        idea("lit.md", "literature", [{ to: "p1.md" }]),
        idea("p1.md", "permanent", []),
    ]);

    it("selects and queues only notes in the chosen stage", () => {
        expect(selectCultivationTarget(staged, new Set(), "literature")).toBe("lit.md");
        expect(cultivationQueue(staged, new Set(), 99, "literature")).toEqual(["lit.md"]);
        expect(cultivationQueue(staged, new Set(), 99, "fleeting")).toEqual(["f2.md", "f1.md"]);
    });

    it("keeps the exclude walk within the stage", () => {
        expect(selectCultivationTarget(staged, new Set(["f2.md"]), "fleeting")).toBe("f1.md");
    });

    it("yields null / [] for a stage nothing is in (AC-4)", () => {
        expect(selectCultivationTarget(staged, new Set(), "evergreen")).toBeNull();
        expect(cultivationQueue(staged, new Set(), 99, "evergreen")).toEqual([]);
    });

    it("is unrestricted when no stage is given (any)", () => {
        expect(cultivationQueue(staged, new Set(), 99)).toEqual(["f2.md", "f1.md", "lit.md", "p1.md"]);
    });
});

describe("stageDistribution (#589, FR-3/FR-4 / AC-3)", () => {
    const m = buildModel([
        idea("a.md", "fleeting", []),
        idea("b.md", "fleeting", []),
        idea("c.md", "literature", []),
        idea("g.md", "🔒 Closed", []), // an unknown, hand-edited state
    ]);
    const dist = stageDistribution(m);

    it("has one entry per lifecycle stage, in canonical order", () => {
        expect(dist.map((e) => e.stage)).toEqual([...LIFECYCLE_STATES]);
    });

    it("counts every note, folds an unknown state into fleeting, and sums to model size", () => {
        const byStage = Object.fromEntries(dist.map((e) => [e.stage, e.count]));
        expect(byStage.fleeting).toBe(3); // a, b, and the garbage-state note folded in
        expect(byStage.literature).toBe(1);
        expect(byStage.permanent).toBe(0);
        expect(dist.reduce((sum, e) => sum + e.count, 0)).toBe(m.size());
    });

    it("carries emoji, label key, and a discrete bar level per stage", () => {
        const fleeting = dist.find((e) => e.stage === "fleeting")!;
        expect(fleeting.emoji).toBeTruthy();
        expect(fleeting.labelKey).toBe("lifecycle_state_fleeting");
        expect(fleeting.level).toBeGreaterThan(0);
        expect(dist.find((e) => e.stage === "permanent")!.level).toBe(0); // empty stage → level 0
        for (const e of dist) {
            expect(e.level).toBeGreaterThanOrEqual(0);
            expect(e.level).toBeLessThanOrEqual(4);
        }
    });

    it("is all-zero, all-level-0 for an empty model", () => {
        const empty = stageDistribution(buildModel([]));
        expect(empty.every((e) => e.count === 0 && e.level === 0)).toBe(true);
    });
});

describe("readyToCultivate (#309 S4)", () => {
    it("counts every non-evergreen, non-archived idea", () => {
        const m = buildModel([
            idea("a.md", "fleeting", []),
            idea("b.md", "permanent", []),
            idea("c.md", "evergreen", []),
            idea("d.md", "archived", []),
        ]);
        expect(readyToCultivate(m)).toBe(2); // a + b
        expect(readyToCultivate(buildModel([]))).toBe(0);
    });
});

/**
 * What the advance control offers (#580).
 *
 * The complaint that started this: promote a note and the button still names the state it is
 * already in. The session has always computed the right answer — nothing read it a second time.
 *
 * And a correction to the issue's own first draft: the control **cannot** disappear. Every state
 * has a non-`archived` target, because the lifecycle is a cycle and not a ladder — `evergreen`
 * goes back to `developing` for rework, and `archived` revives to `fleeting`.
 */
describe("the next state, for every state there is (#580)", () => {
    const advanceOf = (state: string) => {
        const one = buildModel([idea("n.md", state as never, [])]);
        const session = buildCultivationSession(one, "n.md", NOW);
        return session?.moves.find((move) => move.kind === "advance");
    };

    it("offers the state after this one", () => {
        expect(advanceOf("literature")?.proposedState).toBe("permanent");
        expect(advanceOf("fleeting")?.proposedState).toBe("literature");
    });

    it("never offers archiving, and never offers nothing", () => {
        const expected: Record<string, string> = {
            fleeting: "literature",
            literature: "permanent",
            permanent: "developing",
            developing: "evergreen",
            evergreen: "developing",
            archived: "fleeting",
        };
        for (const [state, target] of Object.entries(expected)) {
            const move = advanceOf(state);
            expect({ state, target: move?.proposedState }).toEqual({ state, target });
            expect({ state, label: move?.proposedStateLabelKey }).toEqual({
                state,
                label: `lifecycle_state_${target}`,
            });
        }
    });

    it("carries the label key so the view needs no lifecycle vocabulary", () => {
        expect(advanceOf("fleeting")?.proposedStateLabelKey).toBe("lifecycle_state_literature");
    });
});

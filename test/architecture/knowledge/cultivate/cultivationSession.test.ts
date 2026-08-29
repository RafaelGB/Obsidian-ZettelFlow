import { describe, it, expect } from "@jest/globals";
import {
    buildCultivationSession,
    selectCultivationTarget,
    readyToCultivate,
    cultivationQueue,
} from "architecture/knowledge/cultivate/cultivationSession";
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

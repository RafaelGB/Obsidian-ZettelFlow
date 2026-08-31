import { describe, it, expect } from "@jest/globals";
import {
    buildCultivationSession,
    FRICTION_PROMPTS,
    type CultivationMoveKind,
} from "architecture/knowledge/cultivate/cultivationSession";
import { JUDGEMENT_VERDICTS } from "architecture/knowledge/judgement";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const NOW = 1_000_000_000_000;

// `a` is related to `d` (both link to b), contradicts `x`, and has no sources — so every move fires.
const model = buildModel([
    idea("a.md", "permanent", [{ to: "b.md" }, { to: "x.md", type: "contradicts" }]),
    idea("b.md", "permanent", []),
    idea("x.md", "permanent", []),
    idea("d.md", "permanent", [{ to: "b.md" }]),
]);

describe("deliberate friction is off by default in the model (#338, AC-2)", () => {
    it("produces a session byte-identical to the one before friction existed", () => {
        const plain = buildCultivationSession(model, "a.md", NOW);
        const explicitlyOff = buildCultivationSession(model, "a.md", NOW, undefined, { friction: false });

        expect(explicitlyOff).toEqual(plain);
        for (const move of plain!.moves) expect(move).not.toHaveProperty("friction");
    });
});

describe("friction attaches to the moves that would otherwise answer first (#338, FR-1..FR-4)", () => {
    const session = buildCultivationSession(model, "a.md", NOW, undefined, { friction: true })!;
    const byKind = (kind: CultivationMoveKind) => session.moves.find((move) => move.kind === kind);

    it("asks before revealing related notes", () => {
        expect(byKind("connect")?.friction).toEqual({
            promptKey: "cultivate_friction_connect",
            verdict: "confirmed",
        });
    });

    it("asks for your counterargument before showing contradictions", () => {
        expect(byKind("challenge")?.friction).toEqual({
            promptKey: "cultivate_friction_challenge",
            verdict: "challenged",
        });
    });

    it("asks what evidence you would expect before naming the gap", () => {
        expect(byKind("source")?.friction).toEqual({
            promptKey: "cultivate_friction_source",
            verdict: "confirmed",
        });
    });

    it("leaves the moves that are already your own thought alone", () => {
        expect(byKind("question")?.friction).toBeUndefined();
        expect(byKind("advance")?.friction).toBeUndefined();
    });

    it("changes nothing else about the session", () => {
        const plain = buildCultivationSession(model, "a.md", NOW)!;
        expect(session.moves.map((move) => move.kind)).toEqual(plain.moves.map((move) => move.kind));
        expect(session.maturity).toBe(plain.maturity);
        expect(byKind("connect")?.candidates).toEqual(plain.moves.find((m) => m.kind === "connect")?.candidates);
    });

    it("still honours the recipe: a move left out has no friction to perform", () => {
        const trimmed = buildCultivationSession(model, "a.md", NOW, ["question", "advance"], { friction: true })!;
        expect(trimmed.moves.every((move) => move.friction === undefined)).toBe(true);
    });
});

describe("the friction table is well formed (#338)", () => {
    it("records a real verdict for each prompt", () => {
        for (const friction of Object.values(FRICTION_PROMPTS)) {
            expect(JUDGEMENT_VERDICTS).toContain(friction.verdict);
        }
    });

    it("covers exactly the three reveal-first moves", () => {
        expect(Object.keys(FRICTION_PROMPTS).sort()).toEqual(["challenge", "connect", "source"]);
    });
});

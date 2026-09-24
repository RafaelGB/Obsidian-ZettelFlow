import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const GATE = readFileSync(join(SRC, "architecture", "components", "core", "askGraph", "BlindGate.ts"), "utf8");
const EXPLORE = readFileSync(
    join(SRC, "architecture", "components", "core", "askGraph", "AskGraphRenderer.ts"),
    "utf8"
);
const EN = readFileSync(join(SRC, "architecture", "lang", "locale", "en.ts"), "utf8");

/**
 * Think first, then look (#470) — the parts a pure model cannot hold. Moved to Explore by #576.
 *
 * The sequencing itself is proven by `blindReveal.test.ts`, where the view model simply **does
 * not contain** what the vault holds until you have answered. What is left for here is that the
 * renderer draws only from that model, that the answer is stored before the look, and that none
 * of this turns into a quiz.
 *
 * One assertion inverted when the mechanic moved. It used to demand that the panel **not** touch
 * `graphQuery`, because it had its own walk over the model. That walk was the problem: it was the
 * `about:<term>` predicate reimplemented smaller, and deleting it is what justified the move. So
 * the scan now demands the opposite, and the gate is checked for having no private matcher left.
 */
describe("the renderer can only draw what the view model gives it (#470)", () => {
    it("reads the vault's side out of the view model, never out of its own state", () => {
        expect(GATE).toContain("const view = blindView(this.state);");
        expect(GATE).toContain('this.renderRevealed(view.thought ?? "", view.knewNothing)');
        // `view.knew` is no longer passed because the gate no longer draws it: what you knew
        // is the surface's own answer, one region below. Only whether it was empty is read here.
        expect(GATE).not.toContain("view.knew,");
        // The asking branch takes no arguments at all: there is nothing to pass it.
        expect(GATE).toContain("private renderAsking(): void {");
    });

    it("stores what you thought before it looks", () => {
        // The order is the feature. If the look came first, a crash between the two would lose
        // exactly the half that cannot be reconstructed.
        const reveal = GATE.slice(GATE.indexOf("private async reveal"), GATE.indexOf("     * Only to know"));
        expect(reveal.indexOf("ThoughtStore.getInstance().write")).toBeLessThan(
            reveal.indexOf("this.look(")
        );
    });

    it("uses the query engine that already exists, rather than a second one (#576)", () => {
        expect(GATE).toContain("KnowledgeIndex.getInstance()");
        expect(GATE).toContain("runGraphQuery(model, query)");
        // The walk it replaced, in the exact shape it had. Anything like it coming back is a
        // second engine coming back with it.
        expect(GATE).not.toContain("title.toLowerCase().includes");
    });

    it("keeps the vault off the screen for a second, independent reason (#576)", () => {
        // `blindView` already refuses to carry what the vault holds. The surface hosting the gate
        // also refuses to run its query while the gate is waiting — so a bug in either one alone
        // cannot leak an answer early.
        expect(EXPLORE).toContain("if (this.gate?.waiting)");
    });

    it("has exactly one caller of the reveal logic, in one home (#576, §XI)", () => {
        expect(GATE).toContain('from "application/thinking/blindReveal"');
        expect(EXPLORE).not.toContain("blindReveal");
    });

    it("works offline, with no AI anywhere near it", () => {
        for (const ai of ["architecture/ai", "requestUrl", "fetch("]) {
            expect({ ai, used: GATE.includes(ai) }).toEqual({ ai, used: false });
        }
    });

    it("records the movement as a verdict about your own belief, subject only", () => {
        expect(GATE).toContain("JudgementLog.getInstance().record(");
        expect(GATE).toContain("subject: `blind:${movement}`");
        expect(GATE).not.toContain("note: answer");
    });
});

describe("it is not a quiz (#470, §XII)", () => {
    it("keeps no tally, accuracy or streak", () => {
        for (const scoring of ["accuracy", "streak", "correctCount", "score"]) {
            expect({ scoring, used: GATE.includes(scoring) }).toEqual({ scoring, used: false });
        }
    });

    it("says nothing about whether you were right", () => {
        // "I was wrong" is allowed — it is *your* word about *yourself*. What must not exist is
        // the system saying it.
        const keys = [
            "blind_intro",
            "blind_prompt",
            "blind_reveal",
            "blind_you_thought",
            "blind_you_knew",
            "blind_knew_nothing",
            "blind_what_changed",
        ];
        const judging = /\b(correct|incorrect|right answer|wrong answer|accuracy|score|well done|good)\b/i;
        for (const key of keys) {
            const match = new RegExp(`${key}: '([^']*)'`).exec(EN);
            expect({ key, found: match !== null }).toEqual({ key, found: true });
            expect({ key, judges: judging.test(match?.[1] ?? "") }).toEqual({ key, judges: false });
        }
    });

    it("offers the four movements as your words, not as marks", () => {
        for (const movement of ["nothing", "forgotten", "wrong", "unchanged"]) {
            expect(EN).toContain(`blind_movement_${movement}:`);
        }
        // Phrased in the first person throughout: they are statements you make about yourself.
        expect(EN).toContain("blind_movement_forgotten: 'I had forgotten this'");
        expect(EN).toContain("blind_movement_wrong: 'I was wrong'");
    });
});

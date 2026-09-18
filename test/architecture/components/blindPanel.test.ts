import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const PANEL = readFileSync(join(SRC, "architecture", "components", "core", "lab", "BlindPanel.ts"), "utf8");
const EN = readFileSync(join(SRC, "architecture", "lang", "locale", "en.ts"), "utf8");

/**
 * Think first, then look (#470) — the parts a pure model cannot hold.
 *
 * The sequencing itself is proven by `blindReveal.test.ts`, where the view model simply **does
 * not contain** what the vault holds until you have answered. What is left for here is that the
 * renderer draws only from that model, that the answer is stored before the look, and that none
 * of this turns into a quiz.
 */
describe("the renderer can only draw what the view model gives it (#470)", () => {
    it("reads the vault's side out of the view model, never out of its own state", () => {
        expect(PANEL).toContain("const view = blindView(this.state);");
        expect(PANEL).toContain("this.renderRevealed(view.thought ?? \"\", view.knew, view.knewNothing)");
        // The asking branch takes no arguments at all: there is nothing to pass it.
        expect(PANEL).toContain("private renderAsking(): void {");
    });

    it("stores what you thought before it looks", () => {
        // The order is the feature. If the look came first, a crash between the two would lose
        // exactly the half that cannot be reconstructed.
        const reveal = PANEL.slice(PANEL.indexOf("private async reveal"), PANEL.indexOf("private look"));
        expect(reveal.indexOf("ThoughtStore.getInstance().write")).toBeLessThan(
            reveal.indexOf("this.look(")
        );
    });

    it("uses the model that already exists, rather than a second query surface", () => {
        expect(PANEL).toContain("KnowledgeIndex.getInstance()");
        expect(PANEL).not.toContain("graphQuery");
    });

    it("works offline, with no AI anywhere near it", () => {
        for (const ai of ["architecture/ai", "requestUrl", "fetch("]) {
            expect({ ai, used: PANEL.includes(ai) }).toEqual({ ai, used: false });
        }
    });

    it("records the movement as a verdict about your own belief, subject only", () => {
        expect(PANEL).toContain("JudgementLog.getInstance().record(");
        expect(PANEL).toContain("subject: `blind:${movement}`");
        expect(PANEL).not.toContain("note: answer");
    });
});

describe("it is not a quiz (#470, §XII)", () => {
    it("keeps no tally, accuracy or streak", () => {
        for (const scoring of ["accuracy", "streak", "correctCount", "score"]) {
            expect({ scoring, used: PANEL.includes(scoring) }).toEqual({ scoring, used: false });
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

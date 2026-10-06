import { describe, it, expect } from "@jest/globals";
import { offer, SUGGESTED_MAX, SUGGESTED_QUESTIONS } from "architecture/components/core/askGraph/suggestedQuestions";
import { termWords } from "architecture/components/core/askGraph/termWords";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/** The questions the lenses became (#696): offered only when they answer something. */
describe("suggested questions (#696)", () => {
    it("drops a question that answers nothing, or everything", () => {
        const offered = offer((terms) => (terms.includes("bridge") ? 0 : terms.includes("alone") ? 100 : 5), 100);
        const ids = offered.map((each) => each.question.id);
        expect(ids).not.toContain("bridges");
        expect(ids).not.toContain("alone");
        expect(offered.every((each) => each.count === 5)).toBe(true);
    });

    it("keeps to a row, and does not repeat the plain unsourced question", () => {
        const offered = offer(() => 3, 100);
        expect(offered.length).toBeLessThanOrEqual(SUGGESTED_MAX);
        expect(offered.map((each) => each.question.id)).not.toContain("unsourced");
    });

    it("are named in both languages, as questions and never as advice", () => {
        for (const question of SUGGESTED_QUESTIONS) {
            for (const locale of [en, es] as Record<string, string>[]) {
                const text = locale[question.labelKey];
                expect(typeof text).toBe("string");
                expect(/\b(should|deberías|try|prueba)\b/i.test(text)).toBe(false);
            }
        }
    });
});

describe("a term in words (#696)", () => {
    const name = (hub: string) => (hub === "a/Consensus.md" ? "Consensus" : hub);

    it("says what a chip means, not its syntax", () => {
        expect(termWords("unsourced", name)).toBe("Claims without a source");
        expect(termWords("bridge", name)).toBe("Joins two regions");
        expect(termWords("region:a/Consensus.md", name)).toBe("in Consensus");
        expect(termWords("folder:Reading", name)).toBe("in Reading/");
        expect(termWords("about:entropy", name)).toBe("“entropy”");
        expect(termWords("state:permanent", name)).toBe("permanent");
    });

    it("says a negation as one", () => {
        expect(termWords("!orphan", name)).toBe("not Nothing links to it");
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    BufferedVerdict,
    bufferVerdict,
    dropVerdict,
    flushVerdicts,
    rejectedTargets,
    suggestionSubject,
    suggestionTarget,
} from "application/notes/suggestionVerdicts";

const accepted: BufferedVerdict = {
    subject: suggestionSubject("ideas/atomicity.md"),
    verdict: "accepted",
    at: 1000,
};

const rejected: BufferedVerdict = {
    subject: suggestionSubject("ideas/noise.md"),
    verdict: "rejected",
    at: 1001,
};

describe("a suggestion verdict is recorded where it is taken (#411, §XII)", () => {
    it("identifies a suggestion by path, carrying no content", () => {
        const subject = suggestionSubject("ideas/atomicity.md");
        expect(subject).toBe("suggest-link:ideas/atomicity.md");
        expect(suggestionTarget(subject)).toBe("ideas/atomicity.md");
        expect(suggestionTarget("cultivate:connect")).toBeUndefined();
    });

    it("keeps one verdict per suggestion — changing your mind replaces it", () => {
        const first = bufferVerdict([], accepted);
        const changed = bufferVerdict(first, { ...accepted, verdict: "rejected", at: 2000 });
        expect(changed).toHaveLength(1);
        expect(changed[0].verdict).toBe("rejected");
    });

    it("can forget a verdict entirely", () => {
        expect(dropVerdict(bufferVerdict([], accepted), accepted.subject)).toEqual([]);
    });

    it("remembers which targets were rejected, so they are not proposed again", () => {
        const buffer = bufferVerdict(bufferVerdict([], accepted), rejected);
        expect(rejectedTargets(buffer)).toEqual(["ideas/noise.md"]);
    });

    it("flushes with the created note's path and a derived origin", () => {
        const buffer = bufferVerdict(bufferVerdict([], accepted), rejected);
        const judgements = flushVerdicts(buffer, "zettel/new-note.md");
        expect(judgements).toEqual([
            {
                at: 1000,
                path: "zettel/new-note.md",
                subject: "suggest-link:ideas/atomicity.md",
                origin: "derived",
                verdict: "accepted",
            },
            {
                at: 1001,
                path: "zettel/new-note.md",
                subject: "suggest-link:ideas/noise.md",
                origin: "derived",
                verdict: "rejected",
            },
        ]);
    });

    it("carries an optional reason and confidence only when they were given", () => {
        const [judgement] = flushVerdicts(
            [{ ...accepted, note: "same argument", confidence: "high" }],
            "zettel/new-note.md"
        );
        expect(judgement.note).toBe("same argument");
        expect(judgement.confidence).toBe("high");
        const [bare] = flushVerdicts([accepted], "zettel/new-note.md");
        expect("note" in bare).toBe(false);
        expect("confidence" in bare).toBe(false);
    });

    it("records nothing when no note was created", () => {
        expect(flushVerdicts([accepted], "")).toEqual([]);
    });

    it("never puts proposal text in the subject", () => {
        const buffer = [
            { ...accepted, note: "a private reason mentioning the note body" },
            rejected,
        ];
        for (const judgement of flushVerdicts(buffer, "zettel/new-note.md")) {
            expect(judgement.subject).toMatch(/^suggest-link:[^\s]+$/);
        }
    });
});

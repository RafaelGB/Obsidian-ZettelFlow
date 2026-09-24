import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { applyClaim } from "application/claims";
import { answerReturn, type ReturnWriter } from "architecture/plugin/claims/answerReturn";
import { recordSnapshot, type Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { ClaimSourceSchema } from "architecture/knowledge/claims";
import type { Judgement } from "architecture/knowledge/judgement";

// test/application/claims → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const ANSWER = readFileSync(join(ROOT, "src/architecture/plugin/claims/answerReturn.ts"), "utf8");

const PATH = "Notes/microservices.md";
const STORED = "microservices increase organizational complexity";

function writer(): ReturnWriter & {
    claims: string[];
    removed: number[];
    thoughts: { text: string; about: string }[];
    verdicts: Omit<Judgement, "at">[];
} {
    const claims: string[] = [];
    const removed: number[] = [];
    const thoughts: { text: string; about: string }[] = [];
    const verdicts: Omit<Judgement, "at">[] = [];
    return {
        claims,
        removed,
        thoughts,
        verdicts,
        async writeClaim(_path: string, sentence: string) {
            claims.push(sentence);
            return true;
        },
        async removeClaimAt(_path: string, index: number) {
            removed.push(index);
            return true;
        },
        async writeThought(text: string, about: string) {
            thoughts.push({ text, about });
            return true;
        },
        record(entry: Omit<Judgement, "at">) {
            verdicts.push(entry);
        },
    };
}

const request = {
    path: PATH,
    stored: STORED,
    claimIndex: 0,
    origin: "derived" as const,
};

/**
 * What each of the three answers does (#562, epic #558).
 *
 * The effects are injected, so the rules can be proved without a vault: *it still says this* must
 * write **nothing**, *it says this now* must write the sentence and nothing else, and *I no longer
 * hold this* must put the withdrawn sentence somewhere before it takes it off the note — a
 * rejected conclusion is part of your intellectual history, and losing it here would be the worst
 * thing this feature could do.
 */
describe("the three answers (#562)", () => {
    it("records that it still says this, and writes nothing", async () => {
        const effects = writer();
        expect(await answerReturn({ ...request, answer: "confirmed" }, effects)).toBe(true);
        expect(effects.claims).toEqual([]);
        expect(effects.removed).toEqual([]);
        expect(effects.thoughts).toEqual([]);
        expect(effects.verdicts).toEqual([
            { path: PATH, subject: `claim:${PATH}`, origin: "derived", verdict: "confirmed" },
        ]);
    });

    it("rewrites the claim when it says something else now", async () => {
        const effects = writer();
        const sentence = "microservices move complexity rather than add it";
        expect(await answerReturn({ ...request, answer: "modified", sentence }, effects)).toBe(true);
        expect(effects.claims).toEqual([sentence]);
        expect(effects.removed).toEqual([]);
        expect(effects.verdicts.map((entry) => entry.verdict)).toEqual(["modified"]);
    });

    it("refuses to rewrite a claim with nothing", async () => {
        const effects = writer();
        expect(await answerReturn({ ...request, answer: "modified", sentence: "   " }, effects)).toBe(false);
        expect(effects.claims).toEqual([]);
        expect(effects.verdicts).toEqual([]);
    });

    it("puts a withdrawn claim in the thinking space before taking it off the note", async () => {
        const order: string[] = [];
        const effects = writer();
        const watched: ReturnWriter = {
            ...effects,
            writeThought: async (text, about) => {
                order.push("thought");
                return effects.writeThought(text, about);
            },
            removeClaimAt: async (path, index) => {
                order.push("removed");
                return effects.removeClaimAt(path, index);
            },
        };
        expect(await answerReturn({ ...request, answer: "rejected" }, watched)).toBe(true);
        expect(order).toEqual(["thought", "removed"]);
        expect(effects.thoughts).toEqual([{ text: STORED, about: PATH }]);
        expect(effects.removed).toEqual([0]);
        expect(effects.verdicts.map((entry) => entry.verdict)).toEqual(["rejected"]);
    });

    it("keeps the sentence when the thinking space cannot take it", async () => {
        const effects = writer();
        const refusing: ReturnWriter = { ...effects, writeThought: async () => false };
        expect(await answerReturn({ ...request, answer: "rejected" }, refusing)).toBe(false);
        expect(effects.removed).toEqual([]);
        expect(effects.verdicts).toEqual([]);
    });

    it("never records the sentence, and never reaches the timeline itself", () => {
        expect(ANSWER).not.toMatch(/note:\s/);
        expect(ANSWER).not.toContain("ConceptualTimeline");
        expect(ANSWER).toContain("withWriteBatch");
    });
});

/**
 * The snapshot diff that has never fired (#562 AC-4).
 *
 * `recordSnapshot` has been diff-gated on the claim-text set since #168, and on the reference vault
 * **0 of 200** tracked notes have ever produced one. This is that diff, on the frontmatter the
 * return actually writes.
 */
describe("rewriting the claim is a change the timeline can see (#562)", () => {
    const schema = { claims: new ClaimSourceSchema() };

    function ideaWith(frontmatter: Record<string, unknown>) {
        return deriveIdea(
            {
                path: PATH,
                title: "microservices",
                created: 1,
                modified: 2,
                frontmatter,
                tags: [],
                outgoingLinks: [],
                inlineFields: [],
                resolvedTargets: {},
            },
            schema
        );
    }

    it("appends one snapshot whose claim set differs from the one before it", () => {
        const before: Record<string, unknown> = {};
        applyClaim(before, STORED);
        const history: Snapshot[] = recordSnapshot([], ideaWith(before), 1_000);
        expect(history).toHaveLength(1);

        const after: Record<string, unknown> = { ...before };
        applyClaim(after, "microservices move complexity rather than add it");
        const next = recordSnapshot(history, ideaWith(after), 2_000);

        expect(next).not.toBe(history);
        expect(next).toHaveLength(2);
        expect(next[1].claims).toEqual(["microservices move complexity rather than add it"]);
        expect(next[1].claims).not.toEqual(next[0].claims);
    });

    it("records nothing when the sentence is unchanged", () => {
        const frontmatter: Record<string, unknown> = {};
        applyClaim(frontmatter, STORED);
        const history = recordSnapshot([], ideaWith(frontmatter), 1_000);
        expect(recordSnapshot(history, ideaWith(frontmatter), 2_000)).toBe(history);
    });
});

/**
 * With the history off, the loop still closes (#562 FR-6).
 *
 * Snapshots are opt-in because they store claim texts. The door, the return and the verdict must
 * not require them: you lose the history, not the loop.
 */
describe("the return works with the timeline off (#562)", () => {
    it("records every answer without a snapshot ever being taken", async () => {
        const effects = writer();
        const record = jest.fn(effects.record);
        const watched: ReturnWriter = { ...effects, record };
        for (const answer of ["confirmed", "modified", "rejected"] as const) {
            await answerReturn({ ...request, answer, sentence: "something else" }, watched);
        }
        expect(record).toHaveBeenCalledTimes(3);
        expect(ANSWER).not.toContain("recordSnapshot");
    });
});

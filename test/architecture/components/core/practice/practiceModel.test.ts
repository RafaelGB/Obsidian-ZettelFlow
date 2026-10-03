import { describe, it, expect } from "@jest/globals";
import {
    PRACTICE_WEEKS,
    practiceMix,
    practiceRecent,
    practiceStrip,
} from "architecture/components/core/practice/practiceModel";
import { agencyReviewModel, toDayKey, type Judgement } from "architecture/knowledge/state";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 2, 12);

function judgement(i: number, verdict: Judgement["verdict"], origin: Judgement["origin"] = "ai"): Judgement {
    return { at: NOW - i * 1000, path: `notes/n${i}.md`, subject: "challenge-idea", origin, verdict, confidence: "high" };
}

function log(accepted: number, modified: number, rejected: number, human = 0): Judgement[] {
    const out: Judgement[] = [];
    let i = 0;
    for (let n = 0; n < accepted; n++) out.push(judgement(i++, "accepted"));
    for (let n = 0; n < modified; n++) out.push(judgement(i++, "modified", "derived"));
    for (let n = 0; n < rejected; n++) out.push(judgement(i++, "rejected"));
    for (let n = 0; n < human; n++) out.push(judgement(i++, "accepted", "human"));
    return out;
}

describe("the practice strip (#645 FR-4/5, AC-3)", () => {
    it("is twelve columns of seven days, ending today", () => {
        const strip = practiceStrip({}, NOW);
        expect(PRACTICE_WEEKS).toBe(12);
        expect(strip.columns).toHaveLength(12);
        expect(strip.columns.every((column) => column.cells.length === 7)).toBe(true);
        expect(strip.columns[11].cells[6].date).toBe(toDayKey(NOW));
    });

    it("counts the window and nothing older", () => {
        const counts = {
            [toDayKey(NOW)]: 2,
            [toDayKey(NOW - 83 * DAY)]: 1,
            [toDayKey(NOW - 84 * DAY)]: 5,
        };
        expect(practiceStrip(counts, NOW).total).toBe(3);
    });

    it("marks a month only on the column where it changes", () => {
        const strip = practiceStrip({}, NOW);
        const marked = strip.columns.filter((column) => column.month !== undefined);
        expect(strip.columns[0].month).toBeDefined();
        expect(new Set(marked.map((column) => column.month)).size).toBe(marked.length);
        expect(marked.length).toBeLessThanOrEqual(4);
    });
});

describe("the decision mix (#645 FR-8..11, AC-5/AC-6)", () => {
    it("counts accepted, changed and rejected over every recorded proposal verdict", () => {
        const history = log(8, 5, 3, 4);
        const mix = practiceMix(history)!;
        expect(mix).toMatchObject({ accepted: 8, changed: 5, rejected: 3, total: 16 });
        expect(mix.reading).toBe(agencyReviewModel(history).header.reading);
        expect(mix.segments.map((segment) => segment.kind)).toEqual(["accepted", "changed", "rejected"]);
    });

    it("is nothing when there is no decision on a proposal yet", () => {
        expect(practiceMix([])).toBeNull();
        expect(practiceMix(log(0, 0, 0, 3))).toBeNull();
    });

    it("drops an empty kind from the bar and says too little to read a pattern", () => {
        const mix = practiceMix(log(1, 0, 2))!;
        expect(mix.segments.map((segment) => segment.kind)).toEqual(["accepted", "rejected"]);
        expect(mix.reading).toBe("unknown");
    });

    it("carries no percentage of you", () => {
        expect(Object.keys(practiceMix(log(8, 5, 3))!)).not.toContain("index");
    });
});

describe("recent decisions (#645 FR-12/13, AC-7)", () => {
    it("shows the ten newest, newest first, without who proposed or how sure you were", () => {
        const recent = practiceRecent(log(25, 0, 0));
        expect(recent).toHaveLength(10);
        for (let i = 1; i < recent.length; i++) expect(recent[i - 1].at).toBeGreaterThanOrEqual(recent[i].at);
        expect(recent[0].basename).toBe("n0");
        for (const row of recent) {
            expect(row).not.toHaveProperty("origin");
            expect(row).not.toHaveProperty("confidence");
        }
    });
});

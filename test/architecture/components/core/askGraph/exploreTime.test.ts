import { describe, it, expect } from "@jest/globals";
import { cursorAt, fractionOf, presentAt, timeStrip, TIME_BINS_MAX } from "architecture/components/core/askGraph/exploreTime";
import { normalizeRegionNames, withRegionName, REGION_NAME_MAX } from "architecture/components/core/askGraph/regionNames";
import { runGraphQuery } from "architecture/knowledge/query/graphQuery";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";

const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);

/** **Time** (#697): the vault's growth as a strip, and a cursor through it. */
describe("the time strip (#697)", () => {
    it("bins the notes by when they were made, one bar a month", () => {
        const strip = timeStrip([T0, T0 + 5 * DAY, T0 + 65 * DAY, 0]);
        expect(strip.bins.length).toBe(3);
        expect(strip.bins).toEqual([2, 0, 1]);
        expect(strip.min).toBe(T0);
    });

    it("widens the bins rather than drawing a bar a month for ten years", () => {
        const strip = timeStrip([T0, T0 + 3650 * DAY]);
        expect(strip.bins.length).toBe(TIME_BINS_MAX);
        expect(strip.bins.reduce((a, b) => a + b, 0)).toBe(2);
    });

    it("is empty when no note says when it was made", () => {
        expect(timeStrip([0, 0])).toEqual({ min: 0, max: 0, bins: [], starts: [] });
    });

    it("puts the cursor at now at the end, and maps a fraction back and forth", () => {
        const strip = timeStrip([T0, T0 + 100 * DAY]);
        expect(cursorAt(strip, 1)).toBe(Infinity);
        expect(cursorAt(strip, 0.5)).toBe(T0 + 50 * DAY);
        expect(fractionOf(strip, T0 + 25 * DAY)).toBeCloseTo(0.25, 6);
        expect(fractionOf(strip, Infinity)).toBe(1);
    });

    it("counts the notes there at a moment — a note with no time always is", () => {
        expect(presentAt([T0, T0 + 10 * DAY, 0], T0 + DAY)).toBe(2);
    });
});

/** **Renaming a region** (#697): the owner's word, kept by the hub; empty gives the hub's back. */
describe("region names (#697)", () => {
    it("reads only names that are strings, trimmed and non-empty", () => {
        expect(normalizeRegionNames({ "a.md": "  Systems ", "b.md": 3, "c.md": "  ", "": "x" })).toEqual({ "a.md": "Systems" });
        expect(normalizeRegionNames(null)).toEqual({});
        expect(normalizeRegionNames(["x"])).toEqual({});
    });

    it("keeps a new name, and gives the hub's back for an empty or unchanged one", () => {
        expect(withRegionName({}, "a.md", "Distributed systems", "a")).toEqual({ "a.md": "Distributed systems" });
        expect(withRegionName({ "a.md": "X" }, "a.md", "", "a")).toEqual({});
        expect(withRegionName({ "a.md": "X" }, "a.md", "a", "a")).toEqual({});
    });

    it("keeps a name to a label's length", () => {
        expect(withRegionName({}, "a.md", "x".repeat(200), "a")["a.md"]).toHaveLength(REGION_NAME_MAX);
    });
});

/** **Ask around it** (#697): a note and the notes one link from it, as a term. */
describe("near: (#697)", () => {
    const model = buildModel([
        idea("hub.md", "seed", [{ to: "a.md" }]),
        idea("a.md", "seed", []),
        idea("b.md", "seed", [{ to: "hub.md" }]),
        idea("far.md", "seed", []),
    ]);

    it("is the note and its neighbours, either way, by path or by name", () => {
        const paths = (q: string) => runGraphQuery(model, q).matches.map((each) => each.path).sort();
        expect(paths("near:hub.md")).toEqual(["a.md", "b.md", "hub.md"]);
        expect(paths("near:hub")).toEqual(["a.md", "b.md", "hub.md"]);
        expect(paths("!near:hub")).toEqual(["far.md"]);
    });

    it("needs a note", () => {
        expect(runGraphQuery(model, "near:").error).toBeDefined();
    });
});

import { describe, it, expect } from "@jest/globals";
import {
    FROZEN_QUOTE_LIMIT,
    FROZEN_QUOTE_MAX,
    planCrystallization,
    renderCrystallized,
    renderProvenance,
} from "application/thinking/crystallize";
import { newThought, type Thought } from "application/thinking/thought";

const NOW = 1_700_000_000_000;

function thought(text: string, id: string, offset = 0): Thought {
    return newThought({ text, id, at: NOW + offset });
}

const HEADING = "Born from";
const OMITTED = (count: string) => `and ${count} more`;

describe("proposing a note from thoughts (#468)", () => {
    it("makes one note from one thought", () => {
        const plan = planCrystallization([thought("cognitive tools change the cost of thinking", "t1")]);
        expect(plan?.title).toBe("cognitive tools change the cost of thinking");
        expect(plan?.body).toBe("cognitive tools change the cost of thinking");
        expect(plan?.frozen).toHaveLength(1);
    });

    it("reads in the order you thought it, not the order you selected it", () => {
        const plan = planCrystallization([
            thought("third", "t3", 200),
            thought("first", "t1", 0),
            thought("second", "t2", 100),
        ]);
        expect(plan?.body).toBe("first\n\nsecond\n\nthird");
        expect(plan?.title).toBe("first");
    });

    it("keeps a contradiction as part of the reasoning, not as a problem to resolve", () => {
        const plan = planCrystallization([
            thought("structure helps you think", "t1", 0),
            thought("or maybe that is a simplification", "t2", 100),
            thought("too much structure kills it", "t3", 200),
        ]);
        expect(plan?.body).toContain("or maybe that is a simplification");
        expect(plan?.frozen).toHaveLength(3);
        // Nothing here decides which of the three was right.
        expect(JSON.stringify(plan)).not.toContain("resolved");
    });

    it("proposes a title from the seed's first line, clipped, never from a heading you must write", () => {
        const long = "a".repeat(200);
        const plan = planCrystallization([thought(`${long}\nsecond line`, "t1")]);
        expect(plan?.title.length).toBeLessThanOrEqual(80);
        expect(plan?.title.endsWith("…")).toBe(true);
    });

    it("links back to the thoughts that are on disk, and skips the ones that are not", () => {
        const plan = planCrystallization(
            [thought("one", "t1", 0), thought("two", "t2", 100)],
            { t1: "lab/1-t1.md" }
        );
        expect(plan?.bornFrom).toEqual(["lab/1-t1.md"]);
        // The one with no path still has its frozen quote — that is the half that survives.
        expect(plan?.frozen).toHaveLength(2);
        expect(plan?.frozen[1].path).toBeUndefined();
    });

    it("plans nothing for an empty selection, or one of only blank thoughts", () => {
        expect(planCrystallization([])).toBeUndefined();
        expect(planCrystallization([thought("   ", "t1"), thought("\n\n", "t2")])).toBeUndefined();
    });

    it("caps the quotes, so forty thoughts do not become a wall", () => {
        const many = Array.from({ length: FROZEN_QUOTE_MAX + 8 }, (_, index) =>
            thought(`thought ${index}`, `t${index}`, index)
        );
        const plan = planCrystallization(many);
        expect(plan?.frozen).toHaveLength(FROZEN_QUOTE_MAX);
        expect(plan?.omitted).toBe(8);
        // The body still holds everything; only the provenance is capped.
        expect(plan?.body.split("\n\n")).toHaveLength(FROZEN_QUOTE_MAX + 8);
    });

    it("clips a long quote and collapses its newlines, so provenance stays readable", () => {
        const plan = planCrystallization([thought(`${"x".repeat(400)}\nmore`, "t1")]);
        expect(plan?.frozen[0].quote.length).toBeLessThanOrEqual(FROZEN_QUOTE_LIMIT);
        expect(plan?.frozen[0].quote).not.toContain("\n");
    });
});

describe("provenance that survives the Lab (#468)", () => {
    const plan = planCrystallization(
        [thought("maybe the problem is speed", "t1", 0), thought("or attention", "t2", 100)],
        { t1: "lab/1-t1.md", t2: "lab/2-t2.md" }
    );

    it("writes the quotes as text, not as transclusions", () => {
        const rendered = renderProvenance(plan!, HEADING, OMITTED);
        expect(rendered).toContain('- "maybe the problem is speed"');
        expect(rendered).toContain('- "or attention"');
        // A transclusion or a bare link would render nothing once the thoughts are gone.
        expect(rendered).not.toContain("![[");
        expect(rendered).not.toMatch(/^- \[\[/m);
    });

    it("says how many it left out rather than silently dropping them", () => {
        const many = planCrystallization(
            Array.from({ length: FROZEN_QUOTE_MAX + 3 }, (_, i) => thought(`t ${i}`, `t${i}`, i))
        );
        expect(renderProvenance(many!, HEADING, OMITTED)).toContain("and 3 more");
    });

    it("puts your text first and the archaeology after it", () => {
        const note = renderCrystallized(plan!, "The idea, as I would write it.", HEADING, OMITTED);
        expect(note.indexOf("The idea, as I would write it.")).toBeLessThan(note.indexOf(HEADING));
        expect(note.endsWith("\n")).toBe(true);
    });

    it("uses the body it was given, not the proposed one, because you edited it", () => {
        const note = renderCrystallized(plan!, "Something else entirely.", HEADING, OMITTED);
        expect(note).toContain("Something else entirely.");
        expect(note.split(HEADING)[0]).not.toContain("maybe the problem is speed");
    });
});

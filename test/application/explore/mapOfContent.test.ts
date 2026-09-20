import { describe, it, expect } from "@jest/globals";
import {
    asLinks,
    MAP_ENTRY_LIMIT,
    planMapOfContent,
    safeMapName,
    uniqueName,
} from "application/explore/mapOfContent";
import { rowFacts } from "architecture/knowledge/query/answer";
import { idea, buildModel } from "../../actions/knowledge/support/knowledgeFixture";
import type { RowFact } from "architecture/knowledge/query/answer";

/**
 * **A selection is a place to start** (#486, epic #481).
 *
 * The map is deliberately dull, and the tests are here to keep it that way: a list of links, the
 * facts your selection asked about, and the query it came from. The moment it summarises anything
 * it stops being mechanical output and needs a decision gate it does not have.
 */

const model = buildModel([
    idea("Projects/alpha.md", "permanent", [{ to: "Projects/beta.md", type: "supports" }]),
    idea("Projects/beta.md", "permanent"),
    idea("Reading/gamma.md", "fleeting", [], { claims: [{ text: "a claim" }], hasSources: false }),
]);

const factText = (fact: RowFact) => `${fact.key}${fact.arg ? `(${fact.arg})` : ""} ${fact.value}`;

const plan = (matches = model.all(), terms: string[] = ["state:permanent"]) =>
    planMapOfContent({
        matches,
        terms,
        facts: (each) => rowFacts(each, terms, model),
        factText,
        name: "Permanent notes",
        queryKey: "zfQuery",
        intro: "Found by ZettelFlow:",
        andMore: (hidden) => `…and ${hidden} more.`,
    });

describe("the map is the selection, written down (#486)", () => {
    it("lists every match, in the order it was given, as links", () => {
        const body = plan().content;
        const links = body.split("\n").filter((line) => line.startsWith("- [["));
        expect(links).toHaveLength(3);
        expect(links[0]).toContain("[[alpha]]");
        expect(links[2]).toContain("[[gamma]]");
    });

    it("carries the same facts the answer put on the row", () => {
        // One function, two readers: the map and the list cannot drift into saying different things.
        expect(plan().content).toContain("[[alpha]] — explore_fact_state permanent");
    });

    it("keeps the query, so the map can be re-run", () => {
        expect(plan().content).toContain('zfQuery: "state:permanent"');
    });

    it("says how many it left out rather than truncating quietly", () => {
        const many = Array.from({ length: MAP_ENTRY_LIMIT + 5 }, (_, n) => idea(`n${n}.md`, "permanent"));
        const body = plan(buildModel(many).all(), ["state:permanent"]).content;
        expect(body.split("\n").filter((line) => line.startsWith("- [["))).toHaveLength(MAP_ENTRY_LIMIT);
        expect(body).toContain("…and 5 more.");
    });

    it("concludes nothing — there is no prose beyond the intro and the count", () => {
        const body = plan().content;
        const prose = body
            .split("\n")
            .filter((line) => line.trim() !== "" && !line.startsWith("- [[") && !line.startsWith("---"))
            .filter((line) => !line.startsWith("zfQuery:"));
        expect(prose).toEqual(["Found by ZettelFlow:"]);
    });
});

describe("a map never overwrites (#486)", () => {
    it("numbers a name that is taken", () => {
        const taken = new Set(["Permanent notes", "Permanent notes 2"]);
        expect(uniqueName("Permanent notes", (n) => taken.has(n))).toBe("Permanent notes 3");
        expect(uniqueName("Fresh", () => false)).toBe("Fresh");
    });

    it("strips what a file name cannot hold", () => {
        expect(safeMapName('state:permanent AND "x"/y')).toBe("state permanent AND x y");
    });
});

describe("copy as links (#486)", () => {
    it("is the links and nothing else", () => {
        expect(asLinks(model.all())).toBe("[[alpha]]\n[[beta]]\n[[gamma]]");
    });
});

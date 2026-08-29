import { describe, it, expect } from "@jest/globals";
import { runGraphQuery, GRAPH_QUERY_EXAMPLES } from "architecture/knowledge/query/graphQuery";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;

// A small graph exercising every predicate family.
const model = buildModel([
    idea("alpha.md", "permanent", [{ to: "beta.md", type: "supports" }, { to: "gamma.md", type: "contradicts" }], { created: NOW - 100 * DAY }),
    idea("beta.md", "permanent", [], { created: NOW }),
    idea("gamma.md", "permanent", [], { created: NOW }),
    idea("fleet.md", "fleeting", [], { created: NOW }),
    idea("claimy.md", "permanent", [], { created: NOW, claims: [{ text: "an unsourced claim" }], hasSources: false }),
    idea("sourced.md", "permanent", [], { created: NOW, claims: [{ text: "a sourced claim" }], hasSources: true }),
    idea("hub.md", "permanent", ["h1.md", "h2.md", "h3.md", "h4.md", "h5.md"].map((to) => ({ to })), { created: NOW }),
    ...["h1.md", "h2.md", "h3.md", "h4.md", "h5.md"].map((p) => idea(p, "permanent", [], { created: NOW })),
]);

const paths = (source: string) => runGraphQuery(model, source, NOW).matches.map((m) => m.path);

describe("runGraphQuery (#318 S3)", () => {
    it("filters by lifecycle state combined with a structural predicate (AND)", () => {
        expect(paths("state:permanent AND unsourced")).toEqual(["claimy.md"]); // sourced.md excluded
    });

    it("answers the manifesto example — orphaned permanents older than 30 days", () => {
        expect(paths("state:permanent AND orphan AND older-than:30")).toEqual(["alpha.md"]);
    });

    it("queries by typed relation, with and without a target", () => {
        expect(paths("relation:supports")).toEqual(["alpha.md"]);
        expect(paths("relation:contradicts:gamma")).toEqual(["alpha.md"]);
        expect(paths("relation:supports AND relation:contradicts")).toEqual(["alpha.md"]);
        expect(paths("relation:contradicts:nope")).toEqual([]);
    });

    it("selects hubs by degree, most-connected first", () => {
        expect(paths("hub")).toEqual(["hub.md"]);
        expect(paths("degree>=5")).toEqual(["hub.md"]);
        expect(paths("state:permanent")[0]).toBe("hub.md"); // sorted by connectivity desc
    });

    it("supports OR (disjunctive normal form) across families", () => {
        expect(paths("state:fleeting OR unsourced").sort()).toEqual(["claimy.md", "fleet.md"]);
    });

    it("supports term negation with a leading !", () => {
        const notOrphan = paths("state:permanent AND !orphan");
        expect(notOrphan).toContain("beta.md");
        expect(notOrphan).not.toContain("alpha.md"); // alpha is an orphan
    });

    it("a blank query matches nothing (the surface asks for intent)", () => {
        expect(runGraphQuery(model, "   ", NOW)).toEqual({ matches: [] });
    });

    it("returns a clear error for a malformed query instead of throwing", () => {
        expect(runGraphQuery(model, "state:", NOW).error).toBe("state: needs a value");
        expect(runGraphQuery(model, "wat:foo", NOW).error).toBe('unknown predicate "wat"');
        expect(runGraphQuery(model, "bogus", NOW).error).toBe('unknown predicate "bogus"');
        expect(runGraphQuery(model, "older-than:soon", NOW).error).toBe("older-than: needs a number of days");
    });

    it("every shipped example query parses and runs", () => {
        for (const example of GRAPH_QUERY_EXAMPLES) {
            expect(runGraphQuery(model, example.query, NOW).error).toBeUndefined();
        }
    });
});

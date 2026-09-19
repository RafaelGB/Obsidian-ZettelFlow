import { describe, it, expect } from "@jest/globals";
import { asSelection, invertTerm, matchesFor, toQuery, toggleTerm } from "architecture/knowledge/query/selection";
import { GRAPH_QUERY_EXAMPLES, runGraphQuery } from "architecture/knowledge/query/graphQuery";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

/**
 * **Clicking is the query** (#483, epic #481) — the selection, as a value.
 *
 * A selection is an ordered list of terms, and everything else the surface shows is a projection
 * of it: the chips are the terms, the query text is `toQuery`, the results are `matchesFor`. The
 * DSL stays what saved queries store, so this module has to round-trip it faithfully — and has to
 * be honest when it cannot.
 */

const model = buildModel([
    idea("Projects/alpha.md", "permanent", [{ to: "Projects/beta.md", type: "supports" }]),
    idea("Projects/beta.md", "permanent"),
    idea("Reading/gamma.md", "fleeting", [], { claims: [{ text: "a claim" }], hasSources: false }),
    idea("loose.md", "permanent", ["h1.md", "h2.md", "h3.md", "h4.md", "h5.md"].map((to) => ({ to }))),
    ...["h1.md", "h2.md", "h3.md", "h4.md", "h5.md"].map((p) => idea(p, "fleeting")),
]);

describe("the text is what the selection produces (#483)", () => {
    it("joins terms the way the parser reads them", () => {
        expect(toQuery(["state:permanent", "unsourced"])).toBe("state:permanent AND unsourced");
        expect(toQuery([])).toBe("");
    });

    it("reads a flat query back as the terms that made it", () => {
        expect(asSelection("state:permanent AND unsourced")).toEqual(["state:permanent", "unsourced"]);
        expect(asSelection("  state:permanent   and   orphan ")).toEqual(["state:permanent", "orphan"]);
        expect(asSelection("")).toEqual([]);
    });

    it("refuses a query it cannot show as chips, rather than dropping half of it", () => {
        // A disjunction is not a list of narrowing clicks, and pretending it is would silently
        // change what the query means the next time it is saved.
        expect(asSelection("state:fleeting OR unsourced")).toBeNull();
        expect(asSelection("a AND b or c")).toBeNull();
    });
});

describe("a click adds, and the same click takes it back (#483)", () => {
    it("toggles a term in and out, keeping the order the clicks happened in", () => {
        expect(toggleTerm([], "state:permanent")).toEqual(["state:permanent"]);
        expect(toggleTerm(["state:permanent"], "orphan")).toEqual(["state:permanent", "orphan"]);
        expect(toggleTerm(["state:permanent", "orphan"], "state:permanent")).toEqual(["orphan"]);
    });

    it("treats a negated term as the same term when toggling", () => {
        // Clicking the facet value you already negated should clear it, not add a second copy.
        expect(toggleTerm(["!orphan"], "orphan")).toEqual([]);
    });

    it("inverts a term both ways — negation stays reachable without typing", () => {
        expect(invertTerm("orphan")).toBe("!orphan");
        expect(invertTerm("!orphan")).toBe("orphan");
        expect(invertTerm(" state:permanent ")).toBe("!state:permanent");
    });
});

describe("nothing selected means your whole vault (#483)", () => {
    it("answers with every note, in the order a query would have sorted them", () => {
        const everything = matchesFor(model, []).map((m) => m.path);
        expect(everything).toHaveLength(model.all().length);
        expect(everything[0]).toBe("loose.md"); // most connected first, as runGraphQuery sorts
    });

    it("leaves the engine's own contract alone — a blank query still matches nothing", () => {
        // The surface decides that no filters means everything. runGraphQuery does not, and must
        // not: every saved query has to keep returning exactly what it returned before.
        expect(runGraphQuery(model, "").matches).toEqual([]);
    });

    it("agrees with the engine once there is a term", () => {
        expect(matchesFor(model, ["state:permanent"]).map((m) => m.path)).toEqual(
            runGraphQuery(model, "state:permanent").matches.map((m) => m.path)
        );
    });
});

describe("every example still works the way it did (#483)", () => {
    it("parses, and round-trips through the chips when it is a flat AND", () => {
        for (const example of GRAPH_QUERY_EXAMPLES) {
            const result = runGraphQuery(model, example.query);
            expect({ query: example.query, error: result.error }).toEqual({ query: example.query, error: undefined });

            const terms = asSelection(example.query);
            if (terms === null) continue; // the OR example is shown as text, by design
            expect(toQuery(terms)).toBe(example.query);
            expect(matchesFor(model, terms).map((m) => m.path)).toEqual(result.matches.map((m) => m.path));
        }
    });
});

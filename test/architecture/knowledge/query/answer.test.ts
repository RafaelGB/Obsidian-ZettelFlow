import { describe, it, expect } from "@jest/globals";
import { explainEmpty, rowFacts, ROW_FACT_LIMIT } from "architecture/knowledge/query/answer";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

/**
 * **An answer that explains itself** (#485, epic #481).
 *
 * Two questions the surface used to refuse. *Why is this row here?* — it showed `state · degree`
 * whatever you had asked about, so if you filtered by sources the one fact you cared about was
 * the one fact missing. And *which of my terms emptied this?* — it said "no notes match" and
 * stopped, while knowing perfectly well.
 *
 * Both answers are **mechanical**: a count, a derived per-note fact, an arithmetic narrowing.
 * Neither is ever allowed to become advice about what to do next.
 */

const model = buildModel([
    idea("Projects/alpha.md", "permanent", [
        { to: "Projects/beta.md", type: "supports" },
        { to: "Reading/gamma.md", type: "supports" },
    ]),
    idea("Projects/beta.md", "permanent", [{ to: "Reading/gamma.md", type: "contradicts" }]),
    idea("Reading/gamma.md", "permanent", [], { claims: [{ text: "a claim" }], hasSources: true }),
    idea("Reading/delta.md", "fleeting", [], { claims: [{ text: "a claim" }], hasSources: false }),
]);

describe("which term emptied it (#485)", () => {
    it("names the term that took the count to zero, with the counts either side", () => {
        // Three permanents, none of them unsourced.
        expect(explainEmpty(model, ["state:permanent", "unsourced"])).toEqual({
            term: "unsourced",
            before: 3,
            after: 0,
        });
    });

    it("blames the first term when it is the one that matches nothing", () => {
        const explained = explainEmpty(model, ["state:evergreen", "orphan"]);
        expect(explained).toEqual({ term: "state:evergreen", before: 4, after: 0 });
    });

    it("names the first emptying term, not the smallest or the last", () => {
        // Both of these empty the selection on their own; order decides which is named.
        const forwards = explainEmpty(model, ["state:evergreen", "relation:refutes"]);
        const backwards = explainEmpty(model, ["relation:refutes", "state:evergreen"]);
        expect(forwards?.term).toBe("state:evergreen");
        expect(backwards?.term).toBe("relation:refutes");
    });

    it("says nothing when the selection is not empty", () => {
        expect(explainEmpty(model, ["state:permanent"])).toBeNull();
        expect(explainEmpty(model, [])).toBeNull();
    });

    it("refuses to guess for a query it cannot narrow one term at a time", () => {
        // A disjunction has no single culprit, and inventing one would be exactly the kind of
        // confident wrong answer §XII exists to prevent.
        expect(explainEmpty(model, ["state:fleeting OR unsourced"])).toBeNull();
    });

    it("does not blame a term that is simply misspelled", () => {
        // A parse error is a broken query, not an emptying filter. The surface already says so.
        expect(explainEmpty(model, ["state:permanent", "nonsense:x"])).toBeNull();
    });
});

describe("why this row (#485)", () => {
    const factsOf = (path: string, terms: string[]) =>
        rowFacts(model.all().find((i) => i.path === path)!, terms, model).map((f) => `${f.key}=${f.value}`);

    it("carries the facts the selection asked about, and not the default pair", () => {
        const facts = factsOf("Reading/delta.md", ["unsourced", "state:fleeting"]);
        expect(facts).toEqual(["explore_fact_sources=—", "explore_fact_state=fleeting"]);
    });

    it("counts the edges of the relation type you filtered on", () => {
        const facts = rowFacts(
            model.all().find((i) => i.path === "Projects/alpha.md")!,
            ["relation:supports"],
            model
        );
        expect(facts).toEqual([{ key: "explore_fact_relation", arg: "supports", value: "2" }]);
    });

    it("answers the shape terms with the number behind them", () => {
        expect(factsOf("Reading/gamma.md", ["orphan"])).toEqual(["explore_fact_linked_from=2"]);
        expect(factsOf("Reading/gamma.md", ["leaf"])).toEqual(["explore_fact_links_out=0"]);
        expect(factsOf("Projects/alpha.md", ["hub"])).toEqual(["explore_fact_degree=2"]);
    });

    it("says nothing for a term that has no per-note fact", () => {
        expect(factsOf("Projects/alpha.md", ["about:alpha", "older-than:30"])).toEqual([]);
    });

    it("falls back to state and degree when nothing is selected", () => {
        expect(factsOf("Projects/alpha.md", [])).toEqual([
            "explore_fact_state=permanent",
            "explore_fact_degree=2",
        ]);
    });

    it("stops before a row becomes a paragraph", () => {
        const many = ["state:permanent", "hub", "unsourced", "folder:Projects", "relation:supports", "leaf"];
        expect(rowFacts(model.all()[0], many, model).length).toBeLessThanOrEqual(ROW_FACT_LIMIT);
    });

    it("ignores negation when reading the fact — the fact is the same either way", () => {
        expect(factsOf("Reading/delta.md", ["!unsourced"])).toEqual(["explore_fact_sources=—"]);
    });
});

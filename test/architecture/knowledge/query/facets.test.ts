import { describe, it, expect } from "@jest/globals";
import { deriveFacets, FACET_VALUE_LIMIT } from "architecture/knowledge/query/facets";
import { runGraphQuery } from "architecture/knowledge/query/graphQuery";
import { incomingRelations } from "architecture/knowledge/query/queries";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";

/**
 * **What your vault lets you ask** (#482, epic #481).
 *
 * The facets are the answer to a question the interface never used to ask its own model: which
 * values do you actually use? Two properties carry the weight, and both are tested here rather
 * than described: a value is offered only when it can **narrow** the current selection, and every
 * term the facets emit is a term that finds something.
 */

const group = (facets: ReturnType<typeof deriveFacets>, id: string) => facets.find((f) => f.id === id);
const values = (facets: ReturnType<typeof deriveFacets>, id: string) =>
    (group(facets, id)?.values ?? []).map((v) => v.value);

describe("the values come from the vault (#482)", () => {
    it("offers exactly the lifecycle states in use, most-used first", () => {
        const model = buildModel([
            idea("a.md", "permanent"),
            idea("b.md", "permanent"),
            idea("c.md", "permanent"),
            idea("d.md", "fleeting"),
            idea("e.md", "fleeting"),
            idea("f.md", "literature"),
        ]);
        const facets = deriveFacets(model, model.all());
        expect(values(facets, "state")).toEqual(["permanent", "fleeting", "literature"]);
        expect(group(facets, "state")?.values[0]).toMatchObject({ count: 3, term: "state:permanent" });
    });

    it("offers no relation group at all when no note carries a typed relation", () => {
        const model = buildModel([idea("a.md", "permanent"), idea("b.md", "permanent")]);
        expect(group(deriveFacets(model, model.all()), "relation")).toBeUndefined();
    });
});

describe("a filter that cannot narrow is not a filter (#482)", () => {
    it("omits the state group once the selection is a single state", () => {
        const model = buildModel([idea("a.md", "permanent"), idea("b.md", "permanent"), idea("c.md", "fleeting")]);
        const selection = model.all().filter((i) => i.state === "permanent");
        expect(group(deriveFacets(model, selection), "state")).toBeUndefined();
    });

    it("omits a shape that every note in the selection has", () => {
        // Nothing links to anything here, so every note is an orphan and a leaf: neither narrows.
        const model = buildModel([idea("a.md", "permanent"), idea("b.md", "fleeting")]);
        const shapes = values(deriveFacets(model, model.all()), "shape");
        expect(shapes).not.toContain("orphan");
        expect(shapes).not.toContain("leaf");
    });

    it("keeps a shape only some of the selection has", () => {
        const model = buildModel([
            idea("a.md", "permanent", [{ to: "b.md" }]),
            idea("b.md", "permanent"),
        ]);
        expect(values(deriveFacets(model, model.all()), "shape")).toContain("orphan");
    });

    it("derives nothing at all from an empty selection", () => {
        const model = buildModel([idea("a.md", "permanent")]);
        expect(deriveFacets(model, [])).toEqual([]);
    });
});

describe("folders are the top level, and only that (#482)", () => {
    it("collapses nested paths onto their first segment and ignores the vault root", () => {
        const model = buildModel([
            idea("Projects/a/b.md", "permanent"),
            idea("Projects/c.md", "permanent"),
            idea("Reading/d.md", "permanent"),
            idea("loose.md", "permanent"),
        ]);
        const folders = group(deriveFacets(model, model.all()), "folder");
        expect(folders?.values).toEqual([
            { value: "Projects", count: 2, term: "folder:Projects" },
            { value: "Reading", count: 1, term: "folder:Reading" },
        ]);
    });
});

describe("relations, in both directions (#482)", () => {
    const model = buildModel([
        idea("a.md", "permanent", [{ to: "b.md", type: "supports" }, { to: "c.md", type: "contradicts" }]),
        idea("b.md", "permanent", [{ to: "c.md", type: "supports" }]),
        idea("c.md", "permanent"),
        idea("d.md", "permanent"),
    ]);

    it("counts notes, not edges, for an outgoing relation type", () => {
        const facets = deriveFacets(model, model.all());
        expect(group(facets, "relation")?.values).toEqual([
            { value: "supports", count: 2, term: "relation:supports" },
            { value: "contradicts", count: 1, term: "relation:contradicts" },
        ]);
    });

    it("agrees with walking every note's incoming edges one at a time", () => {
        // The slow way is the oracle: the fast path walks the model's edges once instead.
        const selection = model.all();
        const expected = new Map<string, number>();
        for (const item of selection) {
            for (const type of new Set(incomingRelations(model, item.path).map((r) => r.type))) {
                expected.set(type, (expected.get(type) ?? 0) + 1);
            }
        }
        const total = selection.length;
        const narrowing = [...expected.entries()]
            .filter(([, count]) => count > 0 && count < total)
            .map(([value, count]) => [value, count])
            .sort();
        const facets = deriveFacets(model, selection);
        const offered = (group(facets, "incoming")?.values ?? [])
            .map((v) => [v.value, v.count])
            .sort();
        expect(offered).toEqual(narrowing);
    });
});

describe("a group states what it left out (#482)", () => {
    it("offers twelve values and reports the rest as a number", () => {
        const ideas: Idea[] = [];
        for (let n = 0; n < 30; n++) {
            ideas.push(idea(`src${n}.md`, "permanent", [{ to: `dst${n}.md`, type: `rel${n}` }]));
            ideas.push(idea(`dst${n}.md`, "permanent"));
        }
        const model = buildModel(ideas);
        const facets = deriveFacets(model, model.all());
        expect(group(facets, "relation")?.values).toHaveLength(FACET_VALUE_LIMIT);
        expect(group(facets, "relation")?.hidden).toBe(30 - FACET_VALUE_LIMIT);
    });
});

describe("the same vault derives the same facets (#482)", () => {
    it("does not depend on insertion order", () => {
        const ideas = [
            idea("Projects/a.md", "permanent", [{ to: "b.md", type: "supports" }]),
            idea("b.md", "fleeting"),
            idea("Reading/c.md", "permanent"),
        ];
        const one = buildModel(ideas);
        const other = buildModel([...ideas].reverse());
        expect(deriveFacets(one, one.all())).toEqual(deriveFacets(other, other.all()));
    });
});

describe("every offered term finds something (#482)", () => {
    it("holds for all of them, one at a time — clicking can never empty the results", () => {
        const model = buildModel([
            idea("Projects/alpha.md", "permanent", [{ to: "Projects/beta.md", type: "supports" }]),
            idea("Projects/beta.md", "permanent", [{ to: "Reading/gamma.md", type: "contradicts" }]),
            idea("Reading/gamma.md", "literature", [], { claims: [{ text: "a claim" }], hasSources: false }),
            idea("Reading/delta.md", "fleeting", [], { claims: [{ text: "a claim" }], hasSources: true }),
            idea("loose.md", "permanent", ["h1.md", "h2.md", "h3.md", "h4.md", "h5.md"].map((to) => ({ to }))),
            ...["h1.md", "h2.md", "h3.md", "h4.md", "h5.md"].map((p) => idea(p, "fleeting")),
        ]);
        const facets = deriveFacets(model, model.all());
        expect(facets.length).toBeGreaterThan(0);
        for (const facet of facets) {
            for (const value of facet.values) {
                const result = runGraphQuery(model, value.term);
                expect({ term: value.term, error: result.error, found: result.matches.length }).toEqual({
                    term: value.term,
                    error: undefined,
                    found: value.count,
                });
            }
        }
    });
});

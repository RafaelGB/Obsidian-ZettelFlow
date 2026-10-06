import { describe, it, expect } from "@jest/globals";
import { runGraphQuery } from "architecture/knowledge/query/graphQuery";
import { deriveFacets } from "architecture/knowledge/query/facets";
import { answerFunnel, rowFacts } from "architecture/knowledge/query/answer";
import { graphFacts } from "architecture/knowledge/query/graphFacts";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";

function clique(prefix: string, size: number): Idea[] {
    return Array.from({ length: size }, (_, n) =>
        idea(
            `${prefix}/${prefix}-${n}.md`,
            "permanent",
            Array.from({ length: size }, (_, m) => m)
                .filter((m) => m !== n)
                .map((m) => ({ to: `${prefix}/${prefix}-${m}.md` }))
        )
    );
}

/** Two dense neighbourhoods, one link across them, a contradiction inside one, and a lone note. */
const model = buildModel([
    ...clique("a", 5).map((each, n) => (n === 0 ? { ...each, relations: [...each.relations, { type: "link", from: each.path, to: "b/b-0.md" }] } : each)),
    ...clique("b", 5).map((each, n) => (n === 1 ? { ...each, relations: [...each.relations, { type: "contradicts", from: each.path, to: "b/b-2.md" }] } : each)),
    idea("lone.md", "fleeting", []),
]);
const paths = (query: string) => runGraphQuery(model, query).matches.map((each) => each.path).sort();

/**
 * **The lenses became questions** (#696): the facts only the 3D graph could show — where a note
 * lives, whether it joins two regions, whether it is alone or in a contradiction — are terms now.
 */
describe("the graph's facts are terms (#696)", () => {
    it("finds what joins two regions", () => {
        expect(paths("bridge")).toEqual(["a/a-0.md", "b/b-0.md"]);
    });

    it("finds the notes on their own", () => {
        expect(paths("alone")).toEqual(["lone.md"]);
    });

    it("finds both sides of a contradiction", () => {
        expect(paths("contradiction")).toEqual(["b/b-1.md", "b/b-2.md"]);
    });

    it("finds a region by its hub's path or its name, and negates like any term", () => {
        const hub = graphFacts(model).regionOf.get("a/a-3.md") as string;
        expect(paths(`region:${hub}`)).toHaveLength(5);
        expect(paths(`region:${hub.split("/").pop()?.replace(/\.md$/, "")}`)).toHaveLength(5);
        expect(paths(`!region:${hub}`)).toHaveLength(6);
    });

    it("offers the region as the first facet, and the new shapes beside the old ones", () => {
        const facets = deriveFacets(model, model.all());
        expect(facets[0].id).toBe("region");
        const shapes = facets.find((facet) => facet.id === "shape")?.values.map((value) => value.value) ?? [];
        expect(shapes).toEqual(expect.arrayContaining(["bridge", "alone", "contradiction"]));
    });

    it("gives a row the fact its question asked about", () => {
        const across = rowFacts(model.get("a/a-0.md") as Idea, ["bridge"], model);
        expect(across).toEqual([{ key: "explore_fact_across", value: "1" }]);
        const contra = rowFacts(model.get("b/b-2.md") as Idea, ["contradiction"], model);
        expect(contra).toEqual([{ key: "explore_fact_contradicts", value: "1" }]);
    });
});

describe("how the answer was found (#696)", () => {
    it("walks your vault, then each term, with what each left", () => {
        expect(answerFunnel(model, ["state:permanent", "bridge"])).toEqual([
            { term: null, count: 11 },
            { term: "state:permanent", count: 10 },
            { term: "bridge", count: 2 },
        ]);
    });

    it("is just your vault when nothing is asked", () => {
        expect(answerFunnel(model, [])).toEqual([{ term: null, count: 11 }]);
    });

    it("declines a hand-written query that is not a sequence of steps", () => {
        expect(answerFunnel(model, ["bridge OR alone"])).toBeNull();
    });
});

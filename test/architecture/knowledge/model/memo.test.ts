import { describe, it, expect } from "@jest/globals";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { clearMemo, memoStats, memoise, MEMO_MAX_ENTRIES } from "architecture/knowledge/model/memo";

function modelWith(paths: string[]): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(
        paths.map((path) =>
            deriveIdea(
                {
                    path,
                    title: path,
                    created: 1,
                    modified: 1,
                    frontmatter: {},
                    tags: [],
                    outgoingLinks: [],
                    inlineFields: [],
                },
                {}
            )
        )
    );
    return model;
}

function idea(path: string) {
    return deriveIdea(
        {
            path,
            title: path,
            created: 1,
            modified: 1,
            frontmatter: {},
            tags: [],
            outgoingLinks: [],
            inlineFields: [],
        },
        {}
    );
}

describe("computing once per revision (#458)", () => {
    it("computes once when nothing has changed", () => {
        let calls = 0;
        const count = memoise("test.count", (model: KnowledgeModel) => {
            calls++;
            return model.size?.() ?? 0;
        });
        const model = modelWith(["a.md", "b.md"]);
        count(model);
        count(model);
        count(model);
        expect(calls).toBe(1);
    });

    it("gives back the same answer it gave the first time", () => {
        const heavy = memoise("test.same", (model: KnowledgeModel) => ({ paths: model.all().map((i) => i.path) }));
        const model = modelWith(["a.md"]);
        expect(heavy(model)).toEqual(heavy(model));
    });

    it("recomputes when the model changes", () => {
        let calls = 0;
        const count = memoise("test.count", (model: KnowledgeModel) => {
            calls++;
            return model.all().length;
        });
        const model = modelWith(["a.md"]);
        expect(count(model)).toBe(1);
        model.upsert(idea("b.md"));
        expect(count(model)).toBe(2);
        expect(calls).toBe(2);
    });

    it("keeps different arguments apart, rather than answering the wrong question", () => {
        const limited = memoise("test.limit", (model: KnowledgeModel, limit: number) =>
            model.all().slice(0, limit).length
        );
        const model = modelWith(["a.md", "b.md", "c.md"]);
        expect(limited(model, 1)).toBe(1);
        expect(limited(model, 2)).toBe(2);
        expect(limited(model, 1)).toBe(1);
    });

    it("keeps different projections apart, even on the same model and arguments", () => {
        const model = modelWith(["a.md"]);
        expect(memoise("test.one", () => "one")(model)).toBe("one");
        expect(memoise("test.two", () => "two")(model)).toBe("two");
    });

    it("never memoises an argument it cannot key on, rather than keying it wrongly", () => {
        let calls = 0;
        const withCallback = memoise("test.fn", (model: KnowledgeModel, _filter: (path: string) => boolean) => {
            calls++;
            return model.all().length;
        });
        const model = modelWith(["a.md"]);
        // Two different functions are two different questions, and neither serialises. Computing
        // twice is the only honest answer.
        withCallback(model, () => true);
        withCallback(model, () => false);
        expect(calls).toBe(2);
        expect(memoStats(model).entries).toBe(0);
    });

    it("keeps two models apart, even when they sit at the same revision", () => {
        // A revision number is not an identity: two freshly built models are both at revision 1,
        // and answering one with the other's result is the worst kind of cache bug.
        const projection = memoise("test.identity", (model: KnowledgeModel) => model.all().length);
        const small = modelWith(["a.md"]);
        const large = modelWith(["a.md", "b.md", "c.md"]);
        expect(small.revision()).toBe(large.revision());
        expect(projection(small)).toBe(1);
        expect(projection(large)).toBe(3);
    });

    it("lets a model it no longer holds take its cache with it", () => {
        // A WeakMap, so a discarded model is not kept alive by what was derived from it.
        const model = modelWith(["a.md"]);
        memoise("test.weak", () => 1)(model);
        expect(memoStats(model).entries).toBe(1);
        clearMemo(model);
        expect(memoStats(model).entries).toBe(0);
    });

    it("is bounded, evicting what was used longest ago", () => {
        const model = modelWith(["a.md"]);
        const byNumber = memoise("test.bounded", (_model: KnowledgeModel, n: number) => n);
        for (let n = 0; n < MEMO_MAX_ENTRIES + 10; n++) byNumber(model, n);
        expect(memoStats(model).entries).toBeLessThanOrEqual(MEMO_MAX_ENTRIES);
    });

    it("drops everything for an old revision as soon as the model moves on", () => {
        const model = modelWith(["a.md"]);
        const value = memoise("test.drop", (m: KnowledgeModel) => m.all().length);
        value(model);
        expect(memoStats(model).entries).toBe(1);
        model.upsert(idea("b.md"));
        value(model);
        // One revision's worth of answers at a time: there is no partial staleness to reason about.
        expect(memoStats(model).entries).toBe(1);
        expect(memoStats(model).revision).toBe(model.revision());
    });

    it("lets a failure through instead of remembering it as an answer", () => {
        let calls = 0;
        const failing = memoise("test.throws", () => {
            calls++;
            throw new Error("the projection failed");
        });
        const model = modelWith(["a.md"]);
        expect(() => failing(model)).toThrow("the projection failed");
        expect(() => failing(model)).toThrow("the projection failed");
        expect(calls).toBe(2);
    });
});

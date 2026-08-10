import { describe, it, expect } from "@jest/globals";
import {
    deriveIdea,
    DEFAULT_STATE,
    DEFAULT_RELATION_TYPE,
    IdeaSnapshot,
} from "architecture/knowledge/model/Idea";
import { ClaimSourceSchema } from "architecture/knowledge/claims/ClaimSourceSchema";

function emptySnapshot(path = "a.md"): IdeaSnapshot {
    return {
        path,
        title: "",
        created: 0,
        modified: 0,
        frontmatter: {},
        tags: [],
        outgoingLinks: [],
        inlineFields: [],
    };
}

describe("deriveIdea", () => {
    it("returns documented safe defaults for an empty snapshot (AC-6, FR-9)", () => {
        const idea = deriveIdea(emptySnapshot("notes/a.md"));
        expect(idea.state).toBe(DEFAULT_STATE);
        expect(idea.relations).toEqual([]);
        expect(idea.claims).toEqual([]);
        expect(idea.maturitySignals).toEqual({
            inDegree: 0,
            outDegree: 0,
            degree: 0,
            hasSources: false,
        });
        expect(idea.title).toBe("a"); // basename fallback when no title
    });

    it("never throws on a cache-miss-like (mostly undefined) snapshot", () => {
        const snap = { path: "x.md" } as unknown as IdeaSnapshot;
        expect(() => deriveIdea(snap)).not.toThrow();
        const idea = deriveIdea(snap);
        expect(idea.state).toBe(DEFAULT_STATE);
        expect(idea.relations).toEqual([]);
        expect(idea.claims).toEqual([]);
        expect(idea.title).toBe("x");
    });

    it("exposes stable default constants", () => {
        expect(DEFAULT_STATE).toBe("unknown");
        expect(DEFAULT_RELATION_TYPE).toBe("link");
    });

    it("feeds resolvedTargets to a registered claim schema so sources classify (#148)", () => {
        const snap: IdeaSnapshot = {
            ...emptySnapshot("a.md"),
            frontmatter: { sources: ["[[B]]"] },
            resolvedTargets: { B: "b.md" },
        };
        const idea = deriveIdea(snap, { claims: new ClaimSourceSchema() });
        expect(idea.claims).toEqual([{ text: "a", sources: [{ ref: "b.md", kind: "link" }] }]);
        expect(idea.maturitySignals.hasSources).toBe(true);
    });
});

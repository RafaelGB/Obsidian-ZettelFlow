import { describe, it, expect } from "@jest/globals";
import {
    SatelliteDeclaration,
    resolveSatellite,
    satelliteTitle,
    validateSatellite,
} from "application/notes/satellitePlan";
import { semanticRelationField } from "actions/createSemanticRelation/createSemanticRelationLogic";
import { substituteContextTokens } from "application/notes/contextTokens";

const declaration: SatelliteDeclaration = {
    template: "steps/permanent.md",
    title: "{{title}} — idea",
    targetFolder: "zettel/ideas",
    relation: { type: "inspired-by", direction: "satellite-to-main" },
};

const context = {
    mainTitle: "Luhmann 1992",
    mainPath: "zettel/sources/Luhmann 1992.md",
    frontmatter: { author: "Luhmann", state: "literature" },
    canvasName: "zettel",
};

describe("a satellite declaration is validated before it can write anything (#419)", () => {
    it("accepts a complete declaration", () => {
        expect(validateSatellite(declaration)).toBeUndefined();
    });

    it("rejects a missing or blank template", () => {
        expect(validateSatellite({ ...declaration, template: "" })).toBe("template-missing");
        expect(validateSatellite({ ...declaration, template: "   " })).toBe("template-missing");
        expect(
            validateSatellite({ ...declaration, template: undefined as unknown as string })
        ).toBe("template-missing");
    });

    it("rejects a blank title pattern", () => {
        expect(validateSatellite({ ...declaration, title: "  " })).toBe("title-empty");
    });

    it("rejects a relation type outside the semantic vocabulary", () => {
        expect(
            validateSatellite({
                ...declaration,
                relation: { type: "vaguely-about", direction: "satellite-to-main" },
            })
        ).toBe("relation-invalid");
        // "source" is deliberately not a semantic relation: sources have their own mechanism
        // (the attachSource action and the unsourced predicate), so it must be rejected here.
        expect(
            validateSatellite({
                ...declaration,
                relation: { type: "source", direction: "satellite-to-main" },
            })
        ).toBe("relation-invalid");
    });

    it("rejects a missing relation", () => {
        expect(
            validateSatellite({ ...declaration, relation: undefined as unknown as never })
        ).toBe("relation-invalid");
    });
});

describe("the satellite's name comes from the same tokens the templates use (#419, AC-9)", () => {
    it("substitutes the main note's title", () => {
        expect(satelliteTitle("{{title}} — idea", context)).toBe("Luhmann 1992 — idea");
    });

    it("delegates every other token to substituteContextTokens", () => {
        const pattern = "{{frontmatter.author}} · {{canvas.name}}";
        expect(satelliteTitle(pattern, context)).toBe(
            substituteContextTokens(pattern, context.frontmatter, context.canvasName)
        );
    });

    it("resolves a missing frontmatter key to nothing, like the body templates do", () => {
        expect(satelliteTitle("{{frontmatter.absent}}x", context)).toBe("x");
    });

    it("strips a trailing extension so a pattern cannot smuggle one in", () => {
        expect(satelliteTitle("{{title}}.md", context)).toBe("Luhmann 1992");
    });
});

describe("resolving a declaration yields the path and the edge, or an error (#419)", () => {
    it("announces where the satellite lands and how it relates", () => {
        const plan = resolveSatellite(declaration, context);
        expect(plan).toEqual({
            template: "steps/permanent.md",
            title: "Luhmann 1992 — idea",
            path: "zettel/ideas/Luhmann 1992 — idea.md",
            edge: {
                on: "satellite",
                target: "Luhmann 1992",
                ...semanticRelationField("inspired-by", "Luhmann 1992"),
            },
        });
    });

    it("builds the edge with the one function that makes a typed relation", () => {
        const plan = resolveSatellite(declaration, context);
        expect(plan).not.toHaveProperty("error");
        if ("edge" in plan) {
            expect(plan.edge.key).toBe("inspired-by");
            expect(plan.edge.value).toBe("[[Luhmann 1992]]");
        }
    });

    it("puts the edge on the main note when that is the declared direction", () => {
        const plan = resolveSatellite(
            { ...declaration, relation: { type: "expands", direction: "main-to-satellite" } },
            context
        );
        if (!("edge" in plan)) throw new Error("expected a plan");
        expect(plan.edge.on).toBe("main");
        expect(plan.edge.key).toBe("expands");
        expect(plan.edge.value).toBe("[[Luhmann 1992 — idea]]");
    });

    it("falls back to the main note's folder when none is declared", () => {
        const plan = resolveSatellite({ ...declaration, targetFolder: undefined }, context);
        if (!("path" in plan)) throw new Error("expected a plan");
        expect(plan.path).toBe("zettel/sources/Luhmann 1992 — idea.md");
    });

    it("refuses a pattern that resolves to the main note itself", () => {
        const plan = resolveSatellite(
            { ...declaration, title: "{{title}}", targetFolder: "zettel/sources" },
            context
        );
        expect(plan).toEqual({ error: "self-relation" });
    });

    it("refuses a pattern that resolves to nothing", () => {
        const plan = resolveSatellite({ ...declaration, title: "{{frontmatter.absent}}" }, context);
        expect(plan).toEqual({ error: "title-empty" });
    });

    it("reports the declaration's own defects rather than writing anything", () => {
        expect(resolveSatellite({ ...declaration, template: "" }, context)).toEqual({
            error: "template-missing",
        });
    });

    it("has nothing to say about a step that declares no satellite", () => {
        expect(resolveSatellite(undefined, context)).toBeUndefined();
    });
});

describe("the destination indicator and the build resolve the same way (#419, AC-2)", () => {
    it("is deterministic, so what is shown is what gets written", () => {
        expect(resolveSatellite(declaration, context)).toEqual(resolveSatellite(declaration, context));
    });

    it("converges as the frontmatter fills, which is a preview, not a lie", () => {
        const pattern = { ...declaration, title: "{{frontmatter.author}} — idea" };
        // Mid-walk, before the step that sets `author` has run: the token resolves to nothing, so
        // the preview shows the rest of the pattern. It is what would be written *right now*.
        const early = resolveSatellite(pattern, { ...context, frontmatter: {} });
        if (!early || !("path" in early)) throw new Error("expected a plan");
        expect(early.path).toBe("zettel/ideas/— idea.md");
        // At build time the frontmatter is assembled, and the path is final.
        const final = resolveSatellite(pattern, context);
        if (!final || !("path" in final)) throw new Error("expected a plan");
        expect(final.path).toBe("zettel/ideas/Luhmann — idea.md");
        expect(final.path).not.toBe(early.path);
    });

    it("refuses a pattern that is only tokens once they all resolve to nothing", () => {
        const plan = resolveSatellite(
            { ...declaration, title: "{{frontmatter.absent}}{{frontmatter.also-absent}}" },
            context
        );
        expect(plan).toEqual({ error: "title-empty" });
    });
});

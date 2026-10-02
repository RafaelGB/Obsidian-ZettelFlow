import { describe, it, expect } from "@jest/globals";
import { appendSource, sourceKeyOf } from "application/claims";
import { ClaimSourceSchema } from "architecture/knowledge/claims";

/**
 * Add a source and keep every other one (#641 FR-10, AC-6). `applySource` edits the first entry for
 * the claim door; the next-step card only ever adds, so a link to a note that does not exist yet
 * survives beside the new reference.
 */
describe("appendSource (#641)", () => {
    it("starts a note with no source as a scalar under source", () => {
        const fm: Record<string, unknown> = {};
        expect(appendSource(fm, " Cunningham 1992 ")).toBe(true);
        expect(fm).toEqual({ source: "Cunningham 1992" });
    });

    it("grows the list the note already declares, under the key it uses", () => {
        const fm: Record<string, unknown> = { sources: [] };
        appendSource(fm, "Cunningham 1992");
        expect(fm).toEqual({ sources: ["Cunningham 1992"] });
    });

    it("keeps an unresolved entry beside the new one", () => {
        const fm: Record<string, unknown> = { sources: ["[[Missing]]"] };
        appendSource(fm, "Cunningham 1992");
        expect(fm.sources).toEqual(["[[Missing]]", "Cunningham 1992"]);
    });

    it("turns one source into two", () => {
        const fm: Record<string, unknown> = { source: "Ahrens 2017" };
        appendSource(fm, "Luhmann 1981");
        expect(fm.source).toEqual(["Ahrens 2017", "Luhmann 1981"]);
    });

    it("writes nothing for a blank reference", () => {
        const fm: Record<string, unknown> = { source: "Ahrens 2017" };
        expect(appendSource(fm, "   ")).toBe(false);
        expect(fm).toEqual({ source: "Ahrens 2017" });
    });

    it("names the key a new source goes under", () => {
        expect(sourceKeyOf({})).toBe("source");
        expect(sourceKeyOf({ sources: [] })).toBe("sources");
    });

    it("writes what the claim parser reads back as a source", () => {
        const fm: Record<string, unknown> = { claim: "Debt grows", source: "Ahrens 2017" };
        appendSource(fm, "Luhmann 1981");
        const claims = new ClaimSourceSchema().parse({ path: "a.md", frontmatter: fm, inlineFields: [], resolvedTargets: {} });
        expect(claims.flatMap((claim) => claim.sources.map((source) => source.ref))).toEqual(["Ahrens 2017", "Luhmann 1981"]);
    });
});

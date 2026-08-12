import { describe, it, expect } from "@jest/globals";
import { serializeClaims } from "actions/extractClaims/extractClaimsLogic";
import { ClaimSourceSchema } from "architecture/knowledge/claims/ClaimSourceSchema";
import type { Claim } from "architecture/knowledge/model/Idea";

const claims: Claim[] = [
    { text: "Sleep improves memory", sources: [{ ref: "refs/Paper.md", kind: "link" }, { ref: "https://doi.org/10.1/x", kind: "text" }] },
    { text: "Naps help too", sources: [{ ref: "refs/Paper.md", kind: "link" }, { ref: "https://doi.org/10.1/x", kind: "text" }] },
];

describe("serializeClaims (#155, FR-2, D7, AC-1)", () => {
    it("maps claim texts to the claim[] field", () => {
        expect(serializeClaims(claims).claim).toEqual(["Sleep improves memory", "Naps help too"]);
    });

    it("serializes a link source as an extensionless wikilink and text verbatim, deduped", () => {
        expect(serializeClaims(claims).source).toEqual(["[[Paper]]", "https://doi.org/10.1/x"]);
    });

    it("yields empty arrays for a claim-less note", () => {
        expect(serializeClaims([])).toEqual({ claim: [], source: [] });
    });

    it("round-trips through ClaimSourceSchema.parse back to the original claims (AC-1)", () => {
        const serialized = serializeClaims(claims);
        const reparsed = new ClaimSourceSchema().parse({
            path: "note.md",
            frontmatter: { claim: serialized.claim, source: serialized.source },
            inlineFields: [],
            resolvedTargets: { Paper: "refs/Paper.md" },
        });
        expect(reparsed).toEqual(claims);
    });
});

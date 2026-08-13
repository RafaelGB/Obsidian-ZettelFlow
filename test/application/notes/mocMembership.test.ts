import { describe, it, expect } from "@jest/globals";
import { MemberSource, resolveMembers } from "application/notes/mocMembership";

const SOURCES: MemberSource[] = [
    { path: "permanent/zeta.md", title: "Zeta", tags: ["#zettelkasten", "#idea"] },
    { path: "permanent/alpha.md", title: "Alpha", tags: ["Zettelkasten"] },
    { path: "fleeting/beta.md", title: "Beta", tags: ["#zettelkasten"] },
    { path: "fleeting/gamma.md", title: "Gamma", tags: ["#other"] },
];

describe("resolveMembers", () => {
    it("filters by tag only (case-insensitive, with or without #) and sorts by title", () => {
        const result = resolveMembers(SOURCES, { tag: "zettelkasten" });
        expect(result.map((c) => c.title)).toEqual(["Alpha", "Beta", "Zeta"]);
    });

    it("treats a leading # on the query tag the same as without it", () => {
        const withHash = resolveMembers(SOURCES, { tag: "#zettelkasten" });
        const withoutHash = resolveMembers(SOURCES, { tag: "zettelkasten" });
        expect(withHash).toEqual(withoutHash);
    });

    it("filters by folder only (path prefix)", () => {
        const result = resolveMembers(SOURCES, { folder: "fleeting" });
        expect(result.map((c) => c.path)).toEqual(["fleeting/beta.md", "fleeting/gamma.md"]);
    });

    it("tolerates a trailing slash on the folder query", () => {
        const result = resolveMembers(SOURCES, { folder: "fleeting/" });
        expect(result.map((c) => c.path)).toEqual(["fleeting/beta.md", "fleeting/gamma.md"]);
    });

    it("ANDs tag and folder when both are given", () => {
        const result = resolveMembers(SOURCES, { tag: "zettelkasten", folder: "fleeting" });
        expect(result.map((c) => c.path)).toEqual(["fleeting/beta.md"]);
    });

    it("excludes the MOC's own path", () => {
        const result = resolveMembers(SOURCES, { tag: "zettelkasten" }, "permanent/alpha.md");
        expect(result.map((c) => c.title)).toEqual(["Beta", "Zeta"]);
    });

    it("returns every source (minus the excluded path) when the query is empty", () => {
        const result = resolveMembers(SOURCES, {}, "fleeting/gamma.md");
        expect(result.map((c) => c.title)).toEqual(["Alpha", "Beta", "Zeta"]);
    });

    it("does not match a folder that is only a name prefix of another", () => {
        const sources: MemberSource[] = [
            { path: "notes/a.md", title: "A", tags: [] },
            { path: "notes-archive/b.md", title: "B", tags: [] },
        ];
        const result = resolveMembers(sources, { folder: "notes" });
        expect(result.map((c) => c.path)).toEqual(["notes/a.md"]);
    });
});

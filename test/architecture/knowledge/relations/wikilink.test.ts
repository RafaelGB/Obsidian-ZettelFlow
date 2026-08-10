import { describe, it, expect } from "@jest/globals";
import { stripWikilink, extractWikilinks } from "architecture/knowledge/relations/wikilink";

describe("stripWikilink", () => {
    it("removes alias, heading and block references and unwraps [[ ]]", () => {
        expect(stripWikilink("[[Target]]")).toBe("Target");
        expect(stripWikilink("[[Target|alias]]")).toBe("Target");
        expect(stripWikilink("[[Target#heading]]")).toBe("Target");
        expect(stripWikilink("[[Target^block]]")).toBe("Target");
        expect(stripWikilink("Target")).toBe("Target");
    });
});

describe("extractWikilinks", () => {
    it("handles a scalar wikilink", () => {
        expect(extractWikilinks("[[Y]]")).toEqual(["Y"]);
    });
    it("handles a list of wikilinks", () => {
        expect(extractWikilinks(["[[X]]", "[[Z|z]]"])).toEqual(["X", "Z"]);
    });
    it("returns [] for a non-wikilink value", () => {
        expect(extractWikilinks("just text")).toEqual([]);
        expect(extractWikilinks(42)).toEqual([]);
        expect(extractWikilinks(undefined)).toEqual([]);
    });
});

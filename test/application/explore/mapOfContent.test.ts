import { describe, it, expect } from "@jest/globals";
import { asLinks, mapMembers, MAP_ENTRY_LIMIT } from "application/explore/mapOfContent";
import { mergeMocRegion, MOC_REGION_START } from "application/notes/mocMerge";
import { safeMapName } from "architecture/plugin/explore/createMapOfContent";
import { idea, buildModel } from "../../actions/knowledge/support/knowledgeFixture";

/**
 * **A selection is a place to start** (#486), with one writer (#505).
 *
 * This module chose the members *and* rendered the note until #505. It now only chooses: the
 * rendering belongs to `mocMerge`, which writes into a machine-managed region so a map can be
 * run again without clobbering the prose around it. #486 shipped a second renderer that could
 * not do that, having put re-running out of scope without checking that a re-runnable map
 * already existed three folders away.
 */

const model = buildModel([
    idea("Projects/alpha.md", "permanent", [{ to: "Projects/beta.md", type: "supports" }]),
    idea("Projects/beta.md", "permanent"),
    idea("Reading/gamma.md", "fleeting"),
]);

describe("a selection chooses the members (#505)", () => {
    it("keeps the lens's order — a map that re-sorted would answer a question you did not ask", () => {
        expect(mapMembers({ matches: model.all() }).map((link) => link.title)).toEqual([
            "alpha",
            "beta",
            "gamma",
        ]);
    });

    it("carries the path, so the link survives a note being renamed", () => {
        expect(mapMembers({ matches: model.all() })[0]).toEqual({ path: "Projects/alpha.md", title: "alpha" });
    });

    it("stops at the cap rather than making a map of four thousand notes", () => {
        const many = Array.from({ length: MAP_ENTRY_LIMIT + 5 }, (_, n) => idea(`n${n}.md`, "permanent"));
        expect(mapMembers({ matches: buildModel(many).all() })).toHaveLength(MAP_ENTRY_LIMIT);
    });

    it("renders nothing itself — there is one writer, and this is not it", () => {
        const members = mapMembers({ matches: model.all() });
        expect(JSON.stringify(members)).not.toContain("[[");
        expect(JSON.stringify(members)).not.toContain("---");
    });
});

describe("and the writer can be run again (#505)", () => {
    it("updates the managed region and leaves your prose byte-for-byte", () => {
        // This is the capability #486's own renderer could not offer, and the reason it lost.
        const heading = "Notes in this map";
        const first = mergeMocRegion("", mapMembers({ matches: model.all() }), heading);
        const withProse = `# My map\n\nWhy these belong together: they are all about atomicity.\n\n${first}\n\nA closing thought.\n`;
        const second = mergeMocRegion(withProse, mapMembers({ matches: model.all().slice(0, 2) }), heading);

        expect(second).toContain("Why these belong together: they are all about atomicity.");
        expect(second).toContain("A closing thought.");
        expect(second).toContain(MOC_REGION_START);
        expect(second).not.toContain("gamma");
    });
});

describe("a name a file system can hold (#505)", () => {
    it("strips what a file name cannot carry", () => {
        expect(safeMapName('state:permanent AND "x"/y')).toBe("state permanent AND x y");
    });
});

describe("copy as links (#486)", () => {
    it("is the links and nothing else", () => {
        expect(asLinks(model.all())).toBe("[[alpha]]\n[[beta]]\n[[gamma]]");
    });
});

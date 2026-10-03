import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TFile } from "obsidian";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";

const model = buildModel([
    idea("Hub.md", "permanent", [{ to: "a.md" }]),
    idea("a.md", "permanent"),
    idea("in.md", "permanent", [{ to: "Hub.md" }]),
    idea("far.md", "permanent"),
    idea("old.md", "permanent"),
]);

const rank = jest.fn((input: { excludePaths?: string[] }) =>
    ["far.md", "old.md"]
        .filter((path) => !(input.excludePaths ?? []).includes(path))
        .map((path) => ({ path, basename: path.replace(/\.md$/, ""), reasons: [{ kind: "tag", shared: ["pkm"] }] }))
);

jest.mock("application/notes/resurfaceRanking", () => ({ rankResurfacedNotes: (input: never) => rank(input) }));
jest.mock("architecture/components/core/resurface/resurfaceInputs", () => ({
    buildResurfaceInputs: () => ({ candidates: [], buildActiveSignals: () => ({ path: "Hub.md" }) }),
}));
jest.mock("architecture/knowledge", () => ({
    KnowledgeIndex: {
        getInstance: () => ({ status: "ready", getModel: () => model, recognisesState: () => true }),
    },
}));
const neighbourhoodSpy = { fail: false };
jest.mock("architecture/knowledge/state", () => {
    const actual = jest.requireActual("architecture/knowledge/state") as Record<string, unknown>;
    return {
        ...actual,
        noteNeighbourhood: (...args: unknown[]) => {
            if (neighbourhoodSpy.fail) throw new Error("boom");
            return (actual.noteNeighbourhood as (...a: unknown[]) => unknown)(...args);
        },
    };
});

import { buildCompanionScreen } from "architecture/components/core/noteCompanion/companionModel";

function app() {
    const file = new TFile();
    file.path = "Hub.md";
    file.extension = "md";
    return {
        vault: { getAbstractFileByPath: (path: string) => (path === "Hub.md" ? file : null) },
        metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
    } as never;
}

const subject = { shown: "Hub.md", pinned: false, last: "Hub.md" };

describe("the companion's model reads the neighbourhood once (#643 FR-4, AC-5)", () => {
    beforeEach(() => {
        rank.mockClear();
        neighbourhoodSpy.fail = false;
    });

    it("runs the resurface ranking exactly once per refresh, without the note's neighbours", () => {
        buildCompanionScreen(app(), subject);
        expect(rank).toHaveBeenCalledTimes(1);
        expect(rank.mock.calls[0][0].excludePaths).toEqual(expect.arrayContaining(["Hub.md", "a.md", "in.md"]));
    });

    it("gives the graph's near ring the same notes the section lists, in order", () => {
        const screen = buildCompanionScreen(app(), subject);
        if (screen.kind !== "note") throw new Error(screen.kind);
        const section = screen.model.sections.sections.find((s) => s.id === "nearby");
        const rows = section && section.id === "nearby" ? section.rows.map((r) => r.path) : [];
        expect(screen.model.neighbourhood?.near.map((n) => n.path)).toEqual(rows.slice(0, 3));
        expect(rows).toEqual(["far.md", "old.md"]);
    });

    it("still shows the note when its links could not be read", () => {
        neighbourhoodSpy.fail = true;
        const screen = buildCompanionScreen(app(), subject);
        expect(screen.kind).toBe("note");
        if (screen.kind === "note") expect(screen.model.neighbourhood).toBeNull();
    });
});

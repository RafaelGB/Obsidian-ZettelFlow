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
const scope: { excluded: string | null; status: string } = { excluded: null, status: "ready" };
jest.mock("architecture/knowledge", () => ({
    KnowledgeIndex: {
        getInstance: () => ({
            status: scope.status,
            getModel: () => model,
            recognisesState: () => true,
            excludedBy: (path: string) => (scope.excluded && path.startsWith(`${scope.excluded}/`) ? { kind: "rule", index: 0 } : null),
            scopeRules: () => ({ leaveOut: [{ kind: "folder", op: "in", folder: scope.excluded, subfolders: true }], keep: [] }),
            alsoExcludedBy: () => [],
        }),
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

describe("a note in an excluded folder is outside ZettelFlow (#688)", () => {
    beforeEach(() => {
        rank.mockClear();
        scope.excluded = null;
        scope.status = "ready";
    });

    it("says so, with the folder that excluded it, and reads nothing about the note", () => {
        scope.excluded = "Templates";
        const screen = buildCompanionScreen(app(), { shown: "Templates/Daily.md", pinned: false, last: null });
        expect(screen).toEqual({ kind: "outside", path: "Templates/Daily.md", prefix: "Templates" });
        expect(rank).not.toHaveBeenCalled();
    });

    it("knows it before the index has finished building", () => {
        scope.excluded = "Templates";
        scope.status = "building";
        expect(buildCompanionScreen(app(), { shown: "Templates/Daily.md", pinned: true, last: null }).kind).toBe("outside");
    });

    it("leaves a note in scope exactly as it was", () => {
        scope.excluded = "Templates";
        expect(buildCompanionScreen(app(), subject).kind).toBe("note");
    });
});

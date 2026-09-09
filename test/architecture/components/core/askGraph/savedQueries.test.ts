import { describe, it, expect } from "@jest/globals";
import {
    normalizeSavedQueries,
    addSavedQuery,
    removeSavedQuery,
    renameSavedQuery,
    moveSavedQuery,
    togglePinnedQuery,
    pinnedQueries,
    savedQueryLabel,
} from "architecture/components/core/askGraph/savedQueries";

/**
 * Richer saved queries (#323 G4): the persisted list grows from a bare `string[]` to named,
 * reorderable, pin-to-Home entries. Every operation is pure and keyed by the query text, so it is
 * unit-tested without a view; the renderer persists the result in settings. Legacy `string[]` data
 * must migrate transparently — an install predating G4 keeps its saved queries.
 */
describe("saved graph queries — richer shape (#323 G4)", () => {
    describe("normalizeSavedQueries migrates legacy and canonicalises", () => {
        it("upgrades a legacy string[] to objects", () => {
            expect(normalizeSavedQueries(["state:permanent", "orphan"])).toEqual([
                { query: "state:permanent" },
                { query: "orphan" },
            ]);
        });

        it("keeps the object shape, trims, drops blanks and de-dupes by query", () => {
            expect(
                normalizeSavedQueries([
                    { query: "  hub  ", name: "  Hubs  ", pinned: true },
                    "hub", // duplicate of the trimmed query above
                    { query: "   " }, // blank
                    "orphan",
                ])
            ).toEqual([{ query: "hub", name: "Hubs", pinned: true }, { query: "orphan" }]);
        });

        it("treats undefined as empty", () => {
            expect(normalizeSavedQueries(undefined)).toEqual([]);
        });
    });

    describe("add / remove (now object-shaped, still keyed by query)", () => {
        it("addSavedQuery trims, dedupes and appends", () => {
            expect(addSavedQuery([], "  a  ")).toEqual([{ query: "a" }]);
            expect(addSavedQuery([{ query: "a" }], "a")).toEqual([{ query: "a" }]); // dedupe
            expect(addSavedQuery([{ query: "a" }], "   ")).toEqual([{ query: "a" }]); // blank ignored
            expect(addSavedQuery([{ query: "a" }], "b")).toEqual([{ query: "a" }, { query: "b" }]);
        });

        it("addSavedQuery preserves existing name/pin metadata", () => {
            expect(addSavedQuery([{ query: "a", name: "First", pinned: true }], "b")).toEqual([
                { query: "a", name: "First", pinned: true },
                { query: "b" },
            ]);
        });

        it("removeSavedQuery drops by query and leaves the rest", () => {
            expect(removeSavedQuery([{ query: "a" }, { query: "b" }], "a")).toEqual([{ query: "b" }]);
            expect(removeSavedQuery([{ query: "a" }], "x")).toEqual([{ query: "a" }]);
        });

        it("removeSavedQuery accepts legacy string[] input", () => {
            expect(removeSavedQuery(["a", "b"], "a")).toEqual([{ query: "b" }]);
        });
    });

    describe("renameSavedQuery", () => {
        it("sets a trimmed name on the matching query only", () => {
            expect(renameSavedQuery([{ query: "a" }, { query: "b" }], "a", "  Alpha  ")).toEqual([
                { query: "a", name: "Alpha" },
                { query: "b" },
            ]);
        });

        it("a blank name clears the name", () => {
            expect(renameSavedQuery([{ query: "a", name: "Alpha" }], "a", "   ")).toEqual([{ query: "a" }]);
        });

        it("preserves the pinned flag while renaming", () => {
            expect(renameSavedQuery([{ query: "a", pinned: true }], "a", "Alpha")).toEqual([
                { query: "a", name: "Alpha", pinned: true },
            ]);
        });
    });

    describe("moveSavedQuery", () => {
        const list = [{ query: "a" }, { query: "b" }, { query: "c" }];
        it("moves up", () => {
            expect(moveSavedQuery(list, "b", "up")).toEqual([{ query: "b" }, { query: "a" }, { query: "c" }]);
        });
        it("moves down", () => {
            expect(moveSavedQuery(list, "b", "down")).toEqual([{ query: "a" }, { query: "c" }, { query: "b" }]);
        });
        it("is a no-op at the edges", () => {
            expect(moveSavedQuery(list, "a", "up")).toEqual(list);
            expect(moveSavedQuery(list, "c", "down")).toEqual(list);
            expect(moveSavedQuery(list, "z", "up")).toEqual(list);
        });
    });

    describe("togglePinnedQuery + pinnedQueries", () => {
        it("flips pinned on and off, preserving name", () => {
            const pinned = togglePinnedQuery([{ query: "a", name: "Alpha" }], "a");
            expect(pinned).toEqual([{ query: "a", name: "Alpha", pinned: true }]);
            expect(togglePinnedQuery(pinned, "a")).toEqual([{ query: "a", name: "Alpha" }]);
        });

        it("pinnedQueries returns only pinned entries, in order", () => {
            const list = [{ query: "a", pinned: true }, { query: "b" }, { query: "c", pinned: true }];
            expect(pinnedQueries(list)).toEqual([{ query: "a", pinned: true }, { query: "c", pinned: true }]);
        });
    });

    describe("savedQueryLabel", () => {
        it("prefers the name, falling back to the query text", () => {
            expect(savedQueryLabel({ query: "state:permanent", name: "Permanents" })).toBe("Permanents");
            expect(savedQueryLabel({ query: "orphan" })).toBe("orphan");
            expect(savedQueryLabel({ query: "orphan", name: "   " })).toBe("orphan");
        });
    });
});

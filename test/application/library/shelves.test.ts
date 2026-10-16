import { describe, it, expect } from "@jest/globals";
import type { ShelfItem } from "application/library/shelf";
import {
    canMoveTo,
    normalizeShelfNames,
    onShelf,
    placeOf,
    planDelete,
    planMove,
    planRename,
    rememberCreate,
    rememberDelete,
    rememberRename,
    validateShelfName,
    yourShelves,
} from "application/library/shelves";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const book = (extra: Partial<ShelfItem> = {}): ShelfItem => ({
    id: "Books/a.epub",
    kind: "book",
    format: "epub",
    title: "A",
    file: "Books/a.epub",
    progress: 0,
    highlights: 0,
    born: 0,
    lastRead: 0,
    ...extra,
});
const read = { lastRead: 5, progress: 0.3 };

describe("your shelves: where a book stands (#821 AC-1..AC-3)", () => {
    it("stands on its first shelf of yours, else on the shelf of its status", () => {
        expect(placeOf(book({ collections: ["B", "A"], status: "reading" }))).toEqual({ kind: "own", name: "B" });
        expect(placeOf(book({ status: "finished" }))).toEqual({ kind: "status", status: "finished" });
        expect(placeOf(book())).toEqual({ kind: "status", status: "none" });
    });

    it("is on every shelf of yours it names, first or not, whatever the case or accents", () => {
        expect(onShelf(book({ collections: ["B", "Ensayos"] }), "ensayos")).toBe(true);
        expect(onShelf(book({ collections: ["Clásicos"] }), "clasicos")).toBe(true);
        expect(onShelf(book(), "B")).toBe(false);
    });

    it("lists your shelves once each, A→Z, with the spelling you gave them", () => {
        const items = [book({ collections: ["para releer", "Ensayos"] }), book({ collections: ["Ensayos"] })];
        expect(yourShelves(["Para releer"], items)).toEqual(["Ensayos", "Para releer"]);
        expect(yourShelves([], [])).toEqual([]);
    });

    it("reads nothing into what it is given", () => {
        const frozen = Object.freeze(book({ collections: Object.freeze(["A"]) as string[] }));
        expect(() => planMove(frozen, { kind: "own", name: "B" })).not.toThrow();
        expect(frozen.collections).toEqual(["A"]);
    });
});

describe("putting a book on a shelf (#821 AC-5..AC-9)", () => {
    it("makes your shelf the first of its shelves, keeping the rest and their spelling", () => {
        expect(planMove(book({ collections: ["B", "A"] }), { kind: "own", name: "A" })).toEqual({ collections: ["A", "B"] });
        expect(planMove(book({ collections: ["B", "A"] }), { kind: "own", name: "a" })).toEqual({ collections: ["A", "B"] });
        expect(planMove(book({ collections: ["A", "B"] }), { kind: "own", name: "C" })).toEqual({ collections: ["C", "A", "B"] });
        expect(planMove(book(), { kind: "own", name: "Para releer" })).toEqual({ collections: ["Para releer"] });
    });

    it("takes it off every shelf of yours onto a status shelf, with that status", () => {
        expect(planMove(book({ ...read, status: "reading", collections: ["A"] }), { kind: "status", status: "finished" })).toEqual({ collections: null, status: "finished" });
        expect(planMove(book({ ...read, status: "reading", collections: ["A"] }), { kind: "status", status: "reading" })).toEqual({ collections: null });
        expect(planMove(book({ collections: ["A", "B"] }), { kind: "status", status: "to-read" })).toEqual({ collections: null, status: "to-read" });
    });

    it("puts only a book never opened back On the shelf", () => {
        const fresh = book({ status: "finished", collections: ["A"] });
        expect(planMove(fresh, { kind: "status", status: "none" })).toEqual({ collections: null, status: null });
        expect(canMoveTo(fresh, { kind: "status", status: "none" })).toBe(true);
        const opened = book({ ...read, status: "reading" });
        expect(canMoveTo(opened, { kind: "status", status: "none" })).toBe(false);
        expect(planMove(opened, { kind: "status", status: "none" })).toBeNull();
    });

    it("writes nothing where it already stands, and never moves a saved path", () => {
        expect(planMove(book({ collections: ["A"] }), { kind: "own", name: "A" })).toBeNull();
        expect(planMove(book({ status: "to-read" }), { kind: "status", status: "to-read" })).toBeNull();
        const path = book({ kind: "path", format: "path", file: undefined, id: "path:r1" });
        expect(canMoveTo(path, { kind: "own", name: "A" })).toBe(false);
    });
});

describe("renaming and deleting a shelf (#821 AC-10, AC-11)", () => {
    const notes = [
        { path: "n1.md", article: false, collections: ["A", "C"] },
        { path: "n2.md", article: true, collections: ["C", "A"] },
        { path: "n3.md", article: false, collections: ["B"] },
    ];

    it("renames it where it is in each list, and touches nothing else", () => {
        expect(planRename(notes, "A", "Z")).toEqual([
            { path: "n1.md", article: false, collections: ["Z", "C"] },
            { path: "n2.md", article: true, collections: ["C", "Z"] },
        ]);
        expect(planRename(notes, "a", "C").map((edit) => edit.collections)).toEqual([["C"], ["C"]]);
    });

    it("deletes it from each note, its books staying on their next shelf", () => {
        expect(planDelete(notes, "A")).toEqual([
            { path: "n1.md", article: false, collections: ["C"] },
            { path: "n2.md", article: true, collections: ["C"] },
        ]);
        expect(planDelete(notes, "B")).toEqual([{ path: "n3.md", article: false, collections: null }]);
    });
});

describe("a shelf's name (#821 AC-12)", () => {
    const reserved = [en, es].flatMap((locale) => [locale.shelf_status_reading, locale.shelf_status_to_read, locale.shelf_status_finished, locale.shelf_status_none]);

    it("refuses an empty name, one you have and one of the Library's own in either language", () => {
        expect(validateShelfName(" ", [], reserved)).toMatchObject({ ok: false, reason: "empty" });
        expect(validateShelfName("ensayos", ["Ensayos"], reserved)).toMatchObject({ ok: false, reason: "taken" });
        for (const name of ["Reading", "leyendo", "QUIERO LEERLO", "en la estanteria"]) expect(validateShelfName(name, [], reserved)).toMatchObject({ ok: false, reason: "reserved" });
        expect(validateShelfName("  Para   releer ", [], reserved)).toEqual({ ok: true, name: "Para releer" });
        // Renamed to its own name in another case: not taken by itself.
        expect(validateShelfName("ensayos", ["Ensayos"], reserved, "Ensayos")).toEqual({ ok: true, name: "ensayos" });
    });

    it("keeps the names you made in plugin data, once each", () => {
        expect(rememberCreate(["A"], "a")).toEqual(["A"]);
        expect(rememberCreate(["A"], "B")).toEqual(["A", "B"]);
        expect(rememberRename(["A", "B"], "a", "Z")).toEqual(["Z", "B"]);
        expect(rememberRename([], "A", "Z")).toEqual(["Z"]);
        expect(rememberDelete(["A", "B"], "b")).toEqual(["A"]);
        expect(normalizeShelfNames([1, " ", "A", "a", " B "])).toEqual(["A", "B"]);
        expect(normalizeShelfNames("A")).toEqual([]);
    });
});

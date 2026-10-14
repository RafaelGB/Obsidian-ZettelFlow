/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// The harness can open a whole view; only the Learn room is drawn here.
jest.mock("application/community/view/contributeRoom", () => ({ CONTRIBUTE_ROOM: {} }));
jest.mock("application/community/view/installedRoom", () => ({ INSTALLED_ROOM: {} }));
jest.mock("application/community/view/systemsRoom", () => ({ SYSTEMS_ROOM: {} }));
import { __resetLocal } from "architecture";
import { forgetLearnSession } from "application/community/learn/learnSource";
import { DomNode } from "../../support/dashboardDom";
import { press } from "../../support/readerKeys";
import { focusOn, mountLearn } from "../../support/learnRoomHarness";
import { parseLearnCatalog, type LearnCatalog } from "application/community/learn/learnCatalog";
import { fold, matchRanges, searchCatalog } from "application/community/learn/learnSearch";
import { learnRoomCatalog } from "../../support/learnFixtures";

function catalog(raw: any = learnRoomCatalog()): LearnCatalog {
    const parsed = parseLearnCatalog(raw, { pluginVersion: "3.7.0" });
    if (parsed.status !== "ok") throw new Error(parsed.status);
    return parsed.catalog;
}

describe("matching ignores case and accents (#802 AC-3, FR-7)", () => {
    it("folds accents and case away", () => {
        expect(fold("Canvás ÁRBOL")).toBe("canvas arbol");
    });

    it("finds every match, in the original text's own indices", () => {
        // "Ñandú" is 5 characters; folded, still 5 — the indices are the original's.
        expect(matchRanges("El ñandú y otro Ñandú", "nandu")).toEqual([
            [3, 8],
            [16, 21],
        ]);
        expect(matchRanges("canvas", "canvás")).toEqual([[0, 6]]);
        expect(matchRanges("Biblioteca", "biblioteca")).toEqual([[0, 10]]);
    });

    it("maps a character that decomposes back onto the one it came from", () => {
        // A precomposed "é" and a decomposed "é" (e + U+0301) both fold to "e".
        const text = "café and café";
        expect(matchRanges(text, "cafe")).toEqual([
            [0, 5],
            [10, 14],
        ]);
    });

    it("matches nothing for an empty or blank query", () => {
        expect(matchRanges("anything", "  ")).toEqual([]);
    });
});

describe("search, in three groups (#802 AC-3)", () => {
    it("answers undo in English with tutorials, reference and questions", () => {
        const found = searchCatalog(catalog(), "undo", "en");
        expect(found.tutorials.map((one) => one.id)).toEqual(["undo"]);
        expect(found.reference.map((row) => row.name.en)).toEqual(["Undo"]);
        expect(found.faq.map((entry) => entry.q.en)).toEqual(["Can I undo what a flow wrote?"]);
    });

    it("answers deshacer in Spanish the same way", () => {
        const found = searchCatalog(catalog(), "deshacer", "es");
        expect(found.tutorials.map((one) => one.id)).toEqual(["undo"]);
        expect(found.reference).toHaveLength(1);
        expect(found.faq).toHaveLength(1);
    });

    it("matches step text, and ignores accents in the catalog", () => {
        expect(searchCatalog(catalog(), "body 4", "en").tutorials.map((one) => one.id)).toEqual(["get-started"]);
        expect(searchCatalog(catalog(), "biblioteca", "es").tutorials.map((one) => one.id)).toEqual(["library"]);
        expect(searchCatalog(catalog(), "canvás", "es").tutorials.map((one) => one.id)).toEqual(["library"]);
    });

    it("never finds a tutorial about a newer plugin (AC-7)", () => {
        const raw = learnRoomCatalog();
        raw.tutorials.undo.since = "9.0.0";
        expect(searchCatalog(catalog(raw), "undo", "en").tutorials).toEqual([]);
    });

    it("finds nothing for nonsense", () => {
        expect(searchCatalog(catalog(), "zzzz", "en")).toEqual({ tutorials: [], reference: [], faq: [] });
    });
});

// ── the results, drawn (#802 AC-3, AC-4, AC-5) ─────────────────────────────────

beforeEach(() => {
    __resetLocal();
    forgetLearnSession();
});

afterEach(() => {
    delete (globalThis as any).activeDocument;
});

function type(roomEl: DomNode, query: string): DomNode {
    const input = roomEl.oneByClass("learn-search").find((el) => el.tag === "input") as DomNode;
    input.value = query;
    input.fire("input");
    return input;
}

const marks = (root: DomNode) => root.findAll((el) => el.tag === "mark").map((el) => el.textContent);

describe("typing replaces the tracks with three groups (#802 AC-3, FR-7)", () => {
    it("answers undo with tutorials, reference and questions, each counted, each match marked", async () => {
        const { roomEl } = await mountLearn();
        type(roomEl, "undo");
        const body = roomEl.oneByClass("learn-body");
        expect(body.byClass("learn-results-title").map((el) => el.textContent)).toEqual(["Tutorials · 1", "Reference · 1", "Questions · 1"]);
        expect(body.byClass("learn-track")).toEqual([]);
        expect(roomEl.oneByClass("learn-lookup").hasClass("is-hidden")).toBe(true);
        expect(roomEl.oneByClass("learn-faq").hasClass("is-hidden")).toBe(true);
        // The tutorial's title; the row's name and line; the question.
        expect(marks(body)).toEqual(["Undo", "Undo", "Undo", "undo"]);
        expect(body.findAll((el) => el.tag === "mark").every((el) => el.hasClass("zettelkasten-flow__learn-hit"))).toBe(true);
        // The question is open, so the answer is read where it was found.
        expect(body.byClass("learn-faq-item").map((item) => item.open)).toEqual([true]);
        // The text around a match is text, not markup.
        expect(body.oneByClass("learn-results-grid").oneByClass("learn-tutorial-title").textContent).toBe("Undo what a flow wrote");
    });

    it("answers deshacer in Spanish, and ignores accents both ways", async () => {
        const { roomEl } = await mountLearn({ lang: "es" });
        type(roomEl, "deshacer");
        expect(roomEl.oneByClass("learn-body").byClass("learn-results-group")).toHaveLength(3);
        // The title and summary; the row's name; the question.
        expect(marks(roomEl.oneByClass("learn-body"))).toEqual(["Deshacer", "Deshacer", "Deshacer", "deshacer"]);
        type(roomEl, "biblioteca");
        expect(marks(roomEl.oneByClass("learn-body"))).toEqual(["Biblioteca", "Biblioteca"]);
        type(roomEl, "canvás");
        expect(marks(roomEl.oneByClass("learn-body"))).toEqual(["canvas"]);
    });
});

describe("a query with no answer (#802 AC-4)", () => {
    it("says so, and Clear the search brings the tracks back", async () => {
        const { roomEl } = await mountLearn();
        const input = type(roomEl, "zzzz");
        const none = roomEl.oneByClass("learn-no-match");
        expect(none.find((el) => el.tag === "p")?.textContent).toBe("Nothing matches «zzzz».");
        const clear = none.find((el) => el.tag === "button") as DomNode;
        expect(clear.textContent).toBe("Clear the search");
        clear.click();
        expect(input.value).toBe("");
        expect(roomEl.oneByClass("learn-body").byClass("learn-track")).toHaveLength(3);
        expect(roomEl.oneByClass("learn-lookup").hasClass("is-hidden")).toBe(false);
    });
});

describe("/ goes to the search (#802 AC-5)", () => {
    it("focuses the search from the page, and is typed in a text field", async () => {
        const { roomEl, scope } = await mountLearn();
        const input = roomEl.oneByClass("learn-search").find((el) => el.tag === "input") as DomNode;
        const focus = jest.spyOn(input, "focus");
        focusOn(new DomNode("body"));
        expect(press({ view: { scope } }, "/").defaultPrevented).toBe(true);
        expect(focus).toHaveBeenCalledTimes(1);
        focusOn(new DomNode("input"));
        expect(press({ view: { scope } }, "/").defaultPrevented).toBe(false);
        expect(focus).toHaveBeenCalledTimes(1);
    });

    it("is Learn's only while Learn is in view", async () => {
        const { room, scope } = await mountLearn();
        focusOn(new DomNode("body"));
        room.hidden();
        expect(press({ view: { scope } }, "/").defaultPrevented).toBe(false);
        room.shown();
        expect(press({ view: { scope } }, "/").defaultPrevented).toBe(true);
    });
});
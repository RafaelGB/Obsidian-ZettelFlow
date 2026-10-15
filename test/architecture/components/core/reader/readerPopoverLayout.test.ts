import { describe, it, expect } from "@jest/globals";
import {
    MORE_ORDER,
    POPOVER_SENTENCE_MAX_WORDS,
    POPOVER_WORDS_MAX,
    moreList,
    nextFocus,
    placePopover,
    secondRow,
    selectionSize,
    type PopoverAction,
} from "architecture/components/core/reader/readerPopoverLayout";

const words = (n: number, end = ".") => `${Array.from({ length: n }, (_, i) => `word${i}`).join(" ")}${end}`;
const all = new Set<PopoverAction>(MORE_ORDER);

describe("the size of a selection (#811 FR-4, D3)", () => {
    it("exports its thresholds as named constants", () => {
        expect(POPOVER_WORDS_MAX).toBe(3);
        expect(POPOVER_SENTENCE_MAX_WORDS).toBe(40);
    });

    it("reads one to three words as words", () => {
        expect(selectionSize("casa")).toBe("words");
        expect(selectionSize("the lazy controller")).toBe("words");
        expect(selectionSize("  System  one  ")).toBe("words");
    });

    it("reads four to forty words in one sentence as a sentence", () => {
        expect(selectionSize("one two three four")).toBe("sentence");
        expect(selectionSize(words(40))).toBe("sentence");
        expect(selectionSize("Un sistema no es solo una colección de cosas")).toBe("sentence");
    });

    it("reads a sentence closed by a quote or a bracket as one sentence", () => {
        expect(selectionSize("«Todavía no he encontrado ningún problema que no se complique».")).toBe("sentence");
        expect(selectionSize("He said it was simple enough to try.»")).toBe("sentence");
        expect(selectionSize("(as the book says, more than the sum of its parts.)")).toBe("sentence");
    });

    it("does not take Spanish opening marks for an end", () => {
        expect(selectionSize("¿Por qué no lo vemos venir?")).toBe("sentence");
        expect(selectionSize("¡Ya lo sabíamos todos!")).toBe("sentence");
    });

    it("reads two sentences, a mid-text 。 and a paragraph as a passage", () => {
        expect(selectionSize("Uno. Dos.")).toBe("passage");
        expect(selectionSize("Uno dos tres cuatro. Cinco seis siete.")).toBe("passage");
        expect(selectionSize("これは文です。これも文です")).toBe("passage");
        expect(selectionSize(`${words(20)} ${words(21)}`)).toBe("passage");
    });

    it("reads one sentence of sixty words as a passage (D3 amends AC-4)", () => {
        expect(selectionSize(words(60))).toBe("passage");
    });

    it("pays for an abbreviation mid-text: e.g. makes a passage (known cost, D3)", () => {
        expect(selectionSize("systems, e.g. a forest, hold together")).toBe("passage");
    });
});

describe("the second row: what fits this selection (#811 FR-4–FR-6, AC-4)", () => {
    it("offers each size its own three, in order", () => {
        expect(secondRow("words", all)).toEqual(["look-up", "translate", "link"]);
        expect(secondRow("sentence", all)).toEqual(["claim", "link", "cite"]);
        expect(secondRow("passage", all)).toEqual(["cite", "read-aloud", "claim"]);
    });

    it("skips what is unavailable and promotes nothing in its place", () => {
        expect(secondRow("words", new Set<PopoverAction>(["translate", "link", "claim", "cite"]))).toEqual(["translate", "link"]);
        expect(secondRow("sentence", new Set<PopoverAction>(["link", "look-up", "read-aloud"]))).toEqual(["link"]);
        expect(secondRow("passage", new Set<PopoverAction>(["claim"]))).toEqual(["claim"]);
    });

    it("is empty when nothing it would offer is available", () => {
        expect(secondRow("words", new Set<PopoverAction>(["claim", "cite"]))).toEqual([]);
        expect(secondRow("passage", new Set<PopoverAction>())).toEqual([]);
    });

    it("gives the same row for the same input, every time", () => {
        expect(secondRow("sentence", all)).toEqual(secondRow("sentence", all));
        expect(selectionSize(words(12))).toBe(selectionSize(words(12)));
    });
});

describe("More: the rest, in one order (#811 FR-7)", () => {
    it("keeps the canonical order and leaves out what is already shown", () => {
        expect(MORE_ORDER).toEqual(["claim", "link", "cite", "look-up", "translate", "read-aloud"]);
        expect(moreList(MORE_ORDER, all, ["claim", "link", "cite"])).toEqual(["look-up", "translate", "read-aloud"]);
        expect(moreList(MORE_ORDER, new Set<PopoverAction>(["claim", "cite", "read-aloud"]), ["cite"])).toEqual(["claim", "read-aloud"]);
    });
});

describe("where the popover opens (#811 FR-14–FR-17, D4)", () => {
    const room = { top: 0, bottom: 800 };
    const base = { room, height: 100, line: 30, gap: 8, touch: false };

    it("opens below a pointer selection that has room below", () => {
        const placed = placePopover({ ...base, selection: { top: 200, bottom: 230 } });
        expect(placed).toEqual({ side: "below", y: 238 });
    });

    it("opens above, clear of the line above, when there is no room below", () => {
        const placed = placePopover({ ...base, selection: { top: 700, bottom: 730 } });
        expect(placed.side).toBe("above");
        expect(placed.y).toBeLessThanOrEqual(700 - 30);
        expect(placed.y).toBe(700 - 30 - 8);
    });

    it("falls back to below when neither side fits a short pane", () => {
        const placed = placePopover({ ...base, room: { top: 0, bottom: 200 }, selection: { top: 60, bottom: 90 } });
        expect(placed.side).toBe("below");
    });

    it("keeps a touch selection below, as today", () => {
        expect(placePopover({ ...base, touch: true, selection: { top: 700, bottom: 730 } }).side).toBe("below");
    });
});

describe("walking the popover with the arrows (#811 FR-12)", () => {
    const rows = [6, 3, 4];

    it("moves left and right within a row, clamped", () => {
        expect(nextFocus(rows, { row: 0, col: 2 }, "ArrowRight")).toEqual({ row: 0, col: 3 });
        expect(nextFocus(rows, { row: 0, col: 5 }, "ArrowRight")).toEqual({ row: 0, col: 5 });
        expect(nextFocus(rows, { row: 1, col: 0 }, "ArrowLeft")).toEqual({ row: 1, col: 0 });
    });

    it("moves up and down between rows, keeping the column where it can", () => {
        expect(nextFocus(rows, { row: 0, col: 5 }, "ArrowDown")).toEqual({ row: 1, col: 2 });
        expect(nextFocus(rows, { row: 1, col: 1 }, "ArrowDown")).toEqual({ row: 2, col: 1 });
        expect(nextFocus(rows, { row: 2, col: 3 }, "ArrowDown")).toEqual({ row: 2, col: 3 });
        expect(nextFocus(rows, { row: 0, col: 0 }, "ArrowUp")).toEqual({ row: 0, col: 0 });
        expect(nextFocus(rows, { row: 2, col: 3 }, "ArrowUp")).toEqual({ row: 1, col: 2 });
    });

    it("skips an empty row", () => {
        expect(nextFocus([4, 0, 2], { row: 0, col: 1 }, "ArrowDown")).toEqual({ row: 2, col: 1 });
        expect(nextFocus([4, 0, 2], { row: 2, col: 1 }, "ArrowUp")).toEqual({ row: 0, col: 1 });
    });
});

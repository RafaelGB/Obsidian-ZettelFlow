import { describe, it, expect } from "@jest/globals";
import { chapterText, readableText, textNodes, unwrapMark, wrapSpan, type ParentLike } from "architecture/components/core/reader/readerMarks";
import { FakeEl } from "../../../../support/textDom";

/** <p>Event sourcing <a>stores</a> changes, not <b>state</b>.</p><p>Next one.</p> */
function chapter(): FakeEl {
    return new FakeEl("div", [
        new FakeEl("p", ["Event sourcing ", new FakeEl("a", ["stores"]), " changes, not ", new FakeEl("b", ["state"]), "."]),
        "\n",
        new FakeEl("p", ["Next one."]),
    ]);
}
const makeMark = () => new FakeEl("mark") as unknown as ParentLike;

describe("the chapter's text, as highlights see it (#671)", () => {
    it("reads every text node in order", () => {
        const root = chapter();
        expect(chapterText(root as never)).toBe("Event sourcing stores changes, not state.\nNext one.");
        expect(textNodes(root as never)).toHaveLength(7);
    });

    it("never reads inside a diagram, a style, a script or an open peek (#667)", () => {
        const text = (data: string) => ({ nodeType: 3, data, parentNode: null });
        const el = (nodeName: string, children: unknown[], cls = "") => ({
            nodeType: 1,
            nodeName,
            classList: { contains: (name: string) => name === cls },
            childNodes: children,
        });
        const root = el("DIV", [
            el("P", [text("Read this.")]),
            el("svg", [text("a diagram label")]),
            el("STYLE", [text(".x{}")]),
            el("SCRIPT", [text("run()")]),
            el("DIV", [text("A peeked note.")], "zettelkasten-flow__reader-peek"),
            el("P", [text("And this.")]),
        ]);
        expect(chapterText(root as never)).toBe("Read this.And this.");
    });
});

describe("drawing a highlight over rendered markdown (#671)", () => {
    it("wraps a passage inside one text node in one mark, splitting around it", () => {
        const root = chapter();
        const text = chapterText(root as never);
        const start = text.indexOf("sourcing");
        const marks = wrapSpan(root as never, { start, end: start + "sourcing".length }, makeMark);
        expect(marks).toHaveLength(1);
        expect((marks[0] as unknown as FakeEl).textContent).toBe("sourcing");
        expect(chapterText(root as never)).toBe(text); // the words are untouched
    });

    it("crosses a link and a bold word with one mark per text node", () => {
        const root = chapter();
        const text = chapterText(root as never);
        const start = text.indexOf("stores changes, not state");
        const marks = wrapSpan(root as never, { start, end: start + "stores changes, not state".length }, makeMark);
        expect(marks.map((m) => (m as unknown as FakeEl).textContent)).toEqual(["stores", " changes, not ", "state"]);
        expect(root.all("mark")).toHaveLength(3);
        expect(chapterText(root as never)).toBe(text);
    });

    it("leaves the whitespace between paragraphs alone", () => {
        const root = chapter();
        const text = chapterText(root as never);
        const start = text.indexOf("state.");
        const marks = wrapSpan(root as never, { start, end: text.indexOf("Next") + 4 }, makeMark);
        expect(marks.map((m) => (m as unknown as FakeEl).textContent)).toEqual(["state", ".", "Next"]);
    });

    it("can be taken away again, leaving the text as it was", () => {
        const root = chapter();
        const before = chapterText(root as never);
        const start = before.indexOf("changes");
        const marks = wrapSpan(root as never, { start, end: start + 7 }, makeMark);
        marks.forEach(unwrapMark);
        expect(root.all("mark")).toHaveLength(0);
        expect(chapterText(root as never)).toBe(before);
        // normalize() merges the split text back: the paragraph has its original five children.
        expect(root.all("p")[0].childNodes).toHaveLength(5);
    });

    it("draws nothing for a span outside the text", () => {
        const root = chapter();
        expect(wrapSpan(root as never, { start: 500, end: 510 }, makeMark)).toEqual([]);
    });
});

describe("a book's equations and drawings, as highlights and search see them (#770)", () => {
    const drawing = (...labels: string[]) => {
        const svg = new FakeEl("svg", labels.map((label) => new FakeEl("text", [label])));
        svg.attrs["data-zf-drawing"] = "true";
        return svg;
    };

    it("reads a book's drawing, flagged by the sanitiser, and never an icon of the app", () => {
        const root = new FakeEl("div", [new FakeEl("p", ["See "]), drawing("Input", "Output"), new FakeEl("svg", ["an icon"])]);
        expect(chapterText(root as never)).toBe("See InputOutput");
        // Two labels are two words to a search.
        expect(readableText(root as never)).toBe("See Input Output");
    });

    it("never wraps a mark inside an equation: it tints the whole equation, and the text is unchanged", () => {
        const math = new FakeEl("math", [new FakeEl("mi", ["x"])]);
        const root = new FakeEl("div", [new FakeEl("p", ["a ", math, " b"])]);
        const before = chapterText(root as never);
        const foreign: unknown[] = [];
        const marks = wrapSpan(root as never, { start: 0, end: before.length }, makeMark, (el) => foreign.push(el));
        expect(marks).toHaveLength(2);
        expect(math.all("mark")).toHaveLength(0);
        expect(foreign).toEqual([math]);
        expect(chapterText(root as never)).toBe(before);
    });

    it("tints a drawing once, however many of its labels the span covers", () => {
        const svg = drawing("In", "Out");
        const root = new FakeEl("div", [svg]);
        const foreign: unknown[] = [];
        expect(wrapSpan(root as never, { start: 0, end: 5 }, makeMark, (el) => foreign.push(el))).toEqual([]);
        expect(foreign).toEqual([svg]);
    });
});

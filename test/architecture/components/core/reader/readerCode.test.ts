/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode } from "../../../../support/dashboardDom";
import { fakePrism } from "../../../../support/fakePrism";
import { withTextNodes } from "../../../../support/domText";
import { codeLines, colourListings, mergeListing, runsOf, splitListing } from "architecture/components/core/reader/readerCode";
import { chapterText } from "architecture/components/core/reader/readerMarks";

const SOURCE = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "reader", "readerCode.ts"), "utf8");

const PY = 'def shallow(attribute):\n\t\t"""Adds a null."""\n    return data.put(attribute, None)\n';

function listing(text: string, language?: string, wrap = true) {
    const body = new DomNode("div");
    const pre = body.createEl("pre", language && !wrap ? { attr: { "data-zf-code": language } } : {});
    const holder = wrap ? pre.createEl("code", language ? { attr: { "data-zf-code": language } } : {}) : pre;
    holder.appendText(text);
    return { body, pre };
}

const lines = (pre: any) => pre.byClass("reader-code-line");

let undo: () => void;
beforeAll(() => {
    undo = withTextNodes();
});
afterAll(() => undo());

describe("a listing's text as lines (#824)", () => {
    it("keeps the text exactly, each line with its own end", () => {
        const out = codeLines(PY, fakePrism.tokenize(PY, fakePrism.languages.python));
        expect(out.map((line) => line.segments.map((s) => s.text).join("")).join("")).toBe(PY);
        expect(out).toHaveLength(3);
    });

    it("cuts a token that runs over a line's end, its types kept on both sides", () => {
        const text = 'x = """one\ntwo"""\n';
        const out = codeLines(text, fakePrism.tokenize(text, fakePrism.languages.python));
        expect(out[0].segments.at(-1)).toEqual({ text: '"""one\n', types: ["string", "triple-quoted-string"] });
        expect(out[1].segments[0]).toEqual({ text: 'two"""', types: ["string", "triple-quoted-string"] });
    });

    it("measures indentation in columns, a tab to the next four", () => {
        expect(codeLines("\t\tx\n").map((line) => line.indent)).toEqual([8]);
        expect(codeLines("  \ty\n").map((line) => line.indent)).toEqual([4]);
    });
});

describe("a listing coloured by the theme, never by HTML (#824 FR-3, AC-3)", () => {
    it("draws Prism's tokens with Obsidian's own token classes, line by line in one run", () => {
        const { body, pre } = listing(PY, "python");
        const before = chapterText(body as never);
        expect(colourListings(body as never, fakePrism)).toBe(1);
        const keyword = pre.find((el) => el.hasClass("token") && el.hasClass("keyword") && el.textContent === "def");
        expect(keyword).toBeDefined();
        expect(pre.byClass("reader-code-run")).toHaveLength(1);
        expect(lines(pre)).toHaveLength(3);
        expect(chapterText(body as never)).toBe(before);
        expect(pre.textContent).toBe(PY);
    });

    it("keeps each line's indent as a custom property, never an inline style", () => {
        const { body, pre } = listing(PY, "python");
        colourListings(body as never, fakePrism);
        expect(lines(pre).map((line: any) => line.cssProps["--zf-indent"])).toEqual([undefined, "8", "4"]);
        expect(SOURCE).not.toMatch(/\.style\b|innerHTML|insertAdjacentHTML|\.highlight\(/);
    });

    it("draws a listing in a language Prism does not know, or with no Prism, as plain lines", () => {
        for (const [language, prism] of [["haskell", fakePrism], ["python", null], [undefined, fakePrism]] as const) {
            const { body, pre } = listing("main = print 1\n", language);
            colourListings(body as never, prism as never);
            expect(lines(pre)).toHaveLength(1);
            expect(pre.byClass("token")).toHaveLength(0);
            expect(pre.textContent).toBe("main = print 1\n");
        }
    });

    it("names the listing for a screen reader by its language", () => {
        const a = listing("x\n", "python");
        colourListings(a.body as never, fakePrism);
        expect(a.pre.getAttribute("aria-label")).toBe("Code in Python");
        const b = listing("x\n");
        colourListings(b.body as never, fakePrism);
        expect(b.pre.getAttribute("aria-label")).toBe("Code");
    });

    it("leaves a listing with a callout or a link inside as the book drew it", () => {
        const body = new DomNode("div");
        const pre = body.createEl("pre");
        pre.appendText("x = 1  ");
        pre.createEl("a", { attr: { "data-zf-href": "OEBPS/ch.xhtml#co1" }, text: "1" });
        colourListings(body as never, fakePrism);
        expect(lines(pre)).toHaveLength(0);
        expect(pre.find((el) => el.tag === "a")).toBeDefined();
        expect(pre.textContent).toBe("x = 1  1");
    });
});

describe("a long listing in runs, and back (#824 FR-7)", () => {
    const tall = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n") + "\n";

    it("cuts whole lines into runs, every run but the last saying it continues, and merges back", () => {
        const { body, pre } = listing(tall, "python");
        colourListings(body as never, fakePrism);
        const text = pre.textContent;
        splitListing(pre as never, [4, 4, 2]);
        const runs = runsOf(pre as never) as any[];
        expect(runs.map((run) => run.children.length)).toEqual([4, 4, 2]);
        expect(runs.map((run) => run.getAttribute("data-zf-continues"))).toEqual(["continues", "continues", null]);
        expect(pre.textContent).toBe(text);
        mergeListing(pre as never);
        expect(runsOf(pre as never)).toHaveLength(1);
        expect((runsOf(pre as never)[0] as any).getAttribute("data-zf-continues")).toBeNull();
        expect(pre.textContent).toBe(text);
    });
});

import { describe, it, expect } from "@jest/globals";
import { furnitureOf, reflowPage, type TextRun } from "application/library/pdfText";
import { pageWordsOf } from "application/library/pdfWords";

/**
 * **Page furniture out of the reading view** (#853): a running head and a footer printed on page after
 * page — the shape of a vendor's manual, with its page numbers — are not the page's text.
 */

const H = 842;
const run = (str: string, x: number, y: number, size = 10): TextRun => ({ str, x, y, size, width: str.length * size * 0.5 });

/** A page of the manual: its running head, a body, and a footer in three cells with its number. */
function manualPage(n: number, options: { head?: boolean; title?: string } = {}): TextRun[] {
    const out: TextRun[] = [];
    if (options.head !== false) out.push(run("Acme SMS API - Developer guide", 300, 800, 12));
    if (options.title) out.push(run(options.title, 100, 755, 20));
    out.push(run(`Page ${n} explains how a message is sent to the platform,`, 100, 600), run("and what it answers when the request is wrong.", 100, 586));
    out.push(run("Confidencial", 66, 50, 8), run("Acme Telecom Ltd.", 220, 50, 8), run(`Página ${n} de 30`, 470, 50, 8));
    return out;
}

const pages = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ runs: manualPage(from + i), bottom: 0, height: H }));
const texts = (runs: TextRun[], keys: readonly string[]) => reflowPage(runs, { furniture: { keys: new Set(keys), bottom: 0, height: H } }).map((block) => block.text);

describe("furniture is found by repetition (#853 FR-1)", () => {
    it("finds the running head and every cell of the footer, its page number taken as any number", () => {
        const keys = furnitureOf(pages(2, 4));
        expect(keys).toHaveLength(4);
        const drawn = texts(manualPage(14), keys);
        expect(drawn.join(" ")).not.toMatch(/Acme SMS API - Developer|Confidencial|Acme Telecom|Página/);
        expect(drawn.join(" ")).toContain("Page 14 explains how a message is sent");
    });

    it("needs three pages: a line on two is kept, and so is a document of two pages", () => {
        const two = [...pages(2, 2), { runs: manualPage(4, { head: false }), bottom: 0, height: H }];
        expect(furnitureOf(two).some((key) => key.includes("developer guide"))).toBe(false);
        expect(furnitureOf(pages(2, 2))).toEqual([]);
    });

    it("never takes a line in the middle of the page, however often it repeats", () => {
        const same = Array.from({ length: 4 }, () => ({ runs: [run("Note: every request is signed.", 100, 420)], bottom: 0, height: H }));
        expect(furnitureOf(same)).toEqual([]);
    });
});

describe("only the clear case (#853 FR-3, AC-2)", () => {
    it("keeps a title at the top of its one page", () => {
        const keys = furnitureOf(pages(2, 4));
        expect(texts(manualPage(5, { title: "5 Recepción de mensajes" }), keys)).toContain("5 Recepción de mensajes");
    });

    it("reads a page with no furniture known as it always did", () => {
        expect(reflowPage(manualPage(3), {}).map((b) => b.text).join(" ")).toContain("Acme SMS API - Developer guide");
    });
});

describe("Page view indexes the same text (#853 AC-3)", () => {
    it("leaves the furniture out of the page's words too", () => {
        const keys = furnitureOf(pages(2, 4));
        const items = manualPage(9).map((r) => ({ str: r.str, transform: [r.size, 0, 0, r.size, r.x, r.y], width: r.width, height: r.size, hasEOL: false }));
        const words = pageWordsOf(items, { width: 595, height: H, toViewport: (rect: number[]) => rect }, { furniture: { keys: new Set(keys), bottom: 0, height: H } });
        expect(words.text).not.toContain("Confidencial");
        expect(words.text).toBe(texts(manualPage(9), keys).join(""));
    });
});

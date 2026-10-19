import { describe, it, expect } from "@jest/globals";
import { reflowPage, type PageBlock, type TextRun } from "application/library/pdfText";
import { printOf } from "application/library/pdfPrint";
import { cropOpsOf } from "application/library/pdfCrop";
import { PDFJS_OPS } from "../../support/pdfCropPaper";
import { LOGO, PAGE_H, PAGE_W, across, image, opList, shape, toView } from "../../support/pdfPrintPaper";

/**
 * **Islands of print** (#854): a table and a figure are shown as printed, a rule is a separator, and
 * the page's text keeps every word (FR-4). The shapes are the ones walked on real files: the vendor
 * manual's parameter table, *Attention*'s tables, GPT-4's plots, *A Survey of LLMs*' two columns.
 */

const OPS = cropOpsOf(PDFJS_OPS)!;
const run = (str: string, x: number, y: number, size = 10): TextRun => ({ str, x, y, size, width: str.length * size * 0.5 });
const cells = (y: number, texts: string[], xs: number[], size = 8) => texts.map((text, i) => run(text, xs[i], y, size));
const page = (...entries: Parameters<typeof opList>) => ({ left: 0, bottom: 0, width: PAGE_W, height: PAGE_H, print: printOf(opList(...entries), OPS, toView, PAGE_W, PAGE_H) });
const kinds = (blocks: readonly PageBlock[]) => blocks.map((b) => (b.kind === "island" ? `island:${b.island}` : b.kind));
/** Every letter of the page, in any order: what reads in order is the point of islands; what is kept is every word. */
const letters = (blocks: readonly PageBlock[]) => [...blocks.map((b) => b.text).join("").replace(/\s+/g, "")].sort().join("");

/** The manual's parameters: a header, then rows of five cells, a long description wrapping in its column. */
function parameters(top = 600): TextRun[] {
    const xs = [72, 180, 250, 300, 380];
    const out = [run("Parameters it takes:", 72, top + 30)];
    out.push(...cells(top, ["Nombre", "Tipo", "OB/OP*", "Longitud", "Description"], xs, 9));
    out.push(...cells(top - 20, ["▪ id", "▪ string", "▪ OP", "▪ 128", "▪ The message id"], xs));
    out.push(...cells(top - 40, ["▪ text", "▪ string", "▪ OB", "▪ 1024", "▪ Body of the message"], xs));
    out.push(...cells(top - 60, ["▪ sender", "▪ string", "▪ OB", "▪ 20", "▪ Sender: a number or"], xs), run("a name of up to 11.", 392, top - 71, 8));
    out.push(...cells(top - 90, ["▪ mobile", "▪ string", "▪ OB", "▪ 50", "▪ Recipient of the SMS"], xs));
    out.push(run("After the table, the text goes on: every request is signed with the token.", 72, top - 130), run("And the platform answers with the message's id.", 72, top - 142));
    return out;
}

describe("a table is shown as printed (#854 FR-1, AC-1, AC-4)", () => {
    it("finds the manual's parameters as one island, its header and wrapped lines in it", () => {
        const blocks = reflowPage(parameters(), { page: page() });
        expect(kinds(blocks)).toEqual(["paragraph", "island:table", "paragraph"]);
        const table = blocks[1];
        expect(table.text).toContain("Nombre");
        expect(table.text).toContain("a name of up to 11.");
        expect(table.box!.x).toBeLessThan(72 / PAGE_W);
        expect(table.aspect).toBeGreaterThan(0);
    });

    it("keeps every word of the page (FR-4)", () => {
        expect(letters(reflowPage(parameters(), { page: page() }))).toBe(letters(reflowPage(parameters())));
    });

    it("reads the text after it after it — never as a second column (AC-4)", () => {
        const blocks = reflowPage(parameters(), { page: page() });
        expect(blocks[blocks.length - 1].text).toMatch(/^After the table/);
    });

    it("takes the rule above its header for its own: no separator over a ruled table", () => {
        const blocks = reflowPage(parameters(), { page: page(across(612, 66, 546)) });
        expect(kinds(blocks)).toEqual(["paragraph", "island:table", "paragraph"]);
    });

    it("joins a table cut by a wider gap", () => {
        const xs = [100, 200, 280, 360];
        const rows = (top: number) => [0, 1, 2].flatMap((r) => cells(top - r * 12, [`m${r}`, "5.29", "24.9", "65"], xs, 9));
        const blocks = reflowPage([...rows(600), ...rows(550), run("And a line of prose under it, long enough to be prose.", 72, 480)], { page: page() });
        expect(kinds(blocks).filter((k) => k === "island:table")).toHaveLength(1);
    });

    it("is never prose in two columns, nor a list, nor a page without its print", () => {
        const two = Array.from({ length: 10 }, (_, i) => [run(`Left column line ${i} of a paper with two of them, set close.`, 48, 700 - i * 12, 9.5), run(`and the right column line ${i}, beside it.`, 312, 700 - i * 12, 9.5)]).flat();
        expect(kinds(reflowPage(two, { page: page() }))).not.toContain("island:table");
        expect(reflowPage(parameters(), {}).some((b) => b.kind === "island")).toBe(false);
        expect(reflowPage(parameters(), { page: page(), plain: true }).some((b) => b.kind === "island")).toBe(false);
    });
});

describe("a figure is shown as printed (#854 FR-2, AC-2, AC-3)", () => {
    const prose = (top: number) => [run("The paragraph above the figure reads as it always did, a full line long.", 72, top), run("Figure 1. The caption under it stays text.", 72, 300)];

    it("shows a picture of 30 % of the page in its place, its caption under it as text", () => {
        const blocks = reflowPage([...prose(700), run("And the text after the caption.", 72, 280)], { page: page(image(72, 320, 468, 360)) });
        expect(kinds(blocks)).toEqual(["paragraph", "island:figure", "paragraph"]);
        expect(blocks[2].text).toMatch(/^Figure 1\. The caption/);
    });

    it("takes a title inside its width for its own — a plot's title is printed with it (walked on GPT-4, p. 3)", () => {
        const title = run("OpenAI codebase next word prediction", 80, 684, 10);
        const blocks = reflowPage([title, ...prose(720), run("And the text after the caption.", 72, 280)], { page: page(image(72, 320, 468, 362)) });
        const figure = blocks.find((b) => b.kind === "island")!;
        expect(figure.text).toContain("OpenAI codebase next word prediction");
        expect(figure.box!.y).toBeLessThanOrEqual(1 - (684 + 10) / PAGE_H);
    });

    it("stops its crop short of a line of the page's text: it is read whole (walked on GPT-4, p. 3)", () => {
        const wide = run("A line of the page's prose that runs past the figure's sides, as text does, all the way.", 40, 684, 10);
        const blocks = reflowPage([wide, ...prose(720), run("And the text after the caption.", 72, 280)], { page: page(image(72, 320, 468, 362)) });
        const figure = blocks.find((b) => b.kind === "island")!;
        expect(figure.text).not.toContain("prose that runs past");
        // The line's foot, as a share of the page from its top, is above the crop.
        expect(figure.box!.y).toBeGreaterThanOrEqual(1 - (684 - 3) / PAGE_H - 1e-6);
    });

    it("never takes a logo for a figure", () => {
        expect(reflowPage(prose(700), { page: page(LOGO) }).some((b) => b.kind === "island")).toBe(false);
    });

    it("finds a plot drawn in vector — its bars and its gridlines one figure", () => {
        const bars = Array.from({ length: 20 }, (_, i) => shape(140 + i * 18, 320, 150 + i * 18, 400 + (i % 5) * 20));
        const grid = [400, 440, 480].map((y) => across(y, 130, 520));
        const blocks = reflowPage([...prose(700), run("0%", 120, 318, 6), run("80%", 116, 478, 6)], { page: page(...bars, ...grid) });
        expect(kinds(blocks)).toContain("island:figure");
        expect(kinds(blocks)).not.toContain("rule");
        // Its axis labels are in it: they are not read as text of their own.
        expect(blocks.filter((b) => b.kind === "paragraph").map((b) => b.text).join(" ")).not.toContain("80%");
    });
});

describe("a rule is a separator (#854 FR-5)", () => {
    const text = [run("A first section ends here, with a full line of its prose.", 72, 600), run("A second section begins under the rule, with its own line.", 72, 560)];

    it("draws a long rule between two blocks as a separator, with no text of its own", () => {
        const blocks = reflowPage(text, { page: page(across(580, 72, 540)) });
        expect(kinds(blocks)).toEqual(["paragraph", "rule", "paragraph"]);
        expect(blocks[1].text).toBe("");
    });

    it("never a footer's line, an underline, or the box a listing is drawn in", () => {
        expect(kinds(reflowPage(text, { page: page(across(40, 72, 540)) }))).not.toContain("rule");
        expect(kinds(reflowPage(text, { page: page(across(598, 72, 400)) }))).not.toContain("rule");
    });
});

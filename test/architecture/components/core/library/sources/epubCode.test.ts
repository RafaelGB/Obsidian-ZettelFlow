/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { Component, TFile, __setPrism, prismCalls } from "obsidian";
import { DomNode } from "../../../../../support/dashboardDom";
import { parseXml } from "../../../../../support/miniXml";
import { fakePrism } from "../../../../../support/fakePrism";
import { makeEpub } from "../../../../../support/zipFixture";
import { withTextNodes } from "../../../../../support/domText";
import { openEpubSource } from "architecture/components/core/library/sources/epubSource";

const g = globalThis as any;
let undo: () => void;

const CALIBRE_CSS = ".code { font-family: lucidasanstypewriter; margin: 0 0 0 4.7% } .code2 { font-family: lucidasanstypewriter; text-indent: 7.6%; margin: 0 0 0 4.7% } .mono { font-family: Courier }";
const head = '<link href="../styles/book.css" rel="stylesheet" type="text/css"/>';
const raw = (body: string, withCss = false) =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title>${withCss ? head : ""}</head><body>${body}</body></html>`;

const BOOK = makeEpub({
    title: "Code",
    chapters: [
        { id: "a", href: "text/a.xhtml", title: "A novel's chapter", body: "", raw: raw("<p>Prose and nothing else.</p>") },
        { id: "b", href: "text/b.xhtml", title: "Listings", body: "", raw: raw('<p>See:</p><pre data-code-language="python"><code>def f():\n    return 1\n</code></pre><pre>plain\n</pre>') },
        { id: "c", href: "text/c.xhtml", title: "Converted", body: "", raw: raw('<p class="x">A method:</p><p class="code">void f() {</p><p class="code2">g();</p><p class="code">}</p><p class="x">It calls <span class="mono">g</span>.</p>', true) },
        { id: "d", href: "text/d.xhtml", title: "Unknown", body: "", raw: raw('<pre data-code-language="cobol">MOVE A TO B.\n</pre>') },
    ],
    extra: { "OEBPS/styles/book.css": CALIBRE_CSS },
});

async function open() {
    const file = Object.assign(new TFile(), { path: "Books/code.epub", extension: "epub", stat: { size: BOOK.length } });
    const app = { vault: { readBinary: async () => BOOK.buffer.slice(BOOK.byteOffset, BOOK.byteOffset + BOOK.byteLength) } };
    return openEpubSource(app as never, file);
}

/** A body that remembers what each node looked like the moment it was put on the page. */
function recordingBody() {
    const body = new DomNode("div") as any;
    const attached: { tag: string; tokens: number; lines: number }[] = [];
    const append = body.appendChild.bind(body);
    body.appendChild = (child: any) => {
        attached.push({ tag: child.tag, tokens: child.byClass?.("token")?.length ?? 0, lines: child.byClass?.("reader-code-line")?.length ?? 0 });
        return append(child);
    };
    return { body, attached };
}

describe("a book's code, coloured before it is on the page (#824 FR-3, FR-9, FR-12, AC-M3)", () => {
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        undo = withTextNodes();
    });
    afterAll(() => {
        delete g.DOMParser;
        undo();
    });
    beforeEach(() => __setPrism(fakePrism));

    it("never asks for Prism in a chapter without code", async () => {
        const doc = await open();
        const drawn = await doc.draw(0, new DomNode("div") as never, new Component(), "reading");
        expect(prismCalls.count).toBe(0);
        expect(drawn.listings).toBeUndefined();
    });

    it("puts a chapter's listings on the page already coloured, and counts them", async () => {
        const doc = await open();
        const { body, attached } = recordingBody();
        const drawn = await doc.draw(1, body as never, new Component(), "reading");
        expect(drawn.listings).toBe(2);
        expect(prismCalls.count).toBe(1);
        const listings = attached.filter((node) => node.tag === "pre");
        expect(listings).toHaveLength(2);
        expect(listings[0].tokens).toBeGreaterThan(0);
        expect(listings.every((node) => node.lines > 0)).toBe(true);
        expect(body.find((el: any) => el.tag === "pre")?.getAttribute("aria-label")).toBe("Code in Python");
    });

    it("draws code uncoloured, but as code, where Obsidian's Prism cannot be loaded", async () => {
        __setPrism(null);
        const doc = await open();
        const body = new DomNode("div") as any;
        const drawn = await doc.draw(1, body, new Component(), "reading");
        expect(drawn.listings).toBe(2);
        expect(body.byClass("token")).toHaveLength(0);
        expect(body.byClass("reader-code-line").length).toBeGreaterThan(0);
    });

    it("finds a converted book's code by the face its stylesheet sets it in (FR-12, AC-15)", async () => {
        const doc = await open();
        const body = new DomNode("div") as any;
        const drawn = await doc.draw(2, body, new Component(), "reading");
        expect(drawn.listings).toBe(1);
        const pre = body.find((el: any) => el.tag === "pre");
        expect(pre.textContent).toBe("void f() {\n    g();\n}");
        expect(body.find((el: any) => el.tag === "code")?.textContent).toBe("g");
        expect(body.findAll((el: any) => el.getAttribute?.("class") || el.getAttribute?.("style"))).toEqual([]);
        // A listing with no language costs no Prism.
        expect(prismCalls.count).toBe(0);
    });

    it("draws a listing in a language off the list as plain code", async () => {
        const doc = await open();
        const body = new DomNode("div") as any;
        await doc.draw(3, body, new Component(), "reading");
        const pre = body.find((el: any) => el.tag === "pre");
        expect(pre.getAttribute("data-zf-code")).toBeNull();
        expect(pre.getAttribute("aria-label")).toBe("Code");
        expect(prismCalls.count).toBe(0);
    });
});

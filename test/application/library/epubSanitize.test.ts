import { describe, it, expect } from "@jest/globals";
import { bodyOf, sanitizeChapter, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import { parseXml } from "../../support/miniXml";

/** What the sanitizer built: a tree of plain records, serialised to read like markup. */
interface Built {
    tag: string;
    attrs: Record<string, string>;
    children: (Built | string)[];
}

const builder: ChapterBuilder<Built> = {
    element(parent, tag, attrs) {
        const el: Built = { tag, attrs, children: [] };
        parent.children.push(el);
        return el;
    },
    text(parent, text) {
        parent.children.push(text);
    },
};

function html(el: Built | string): string {
    if (typeof el === "string") return el;
    const attrs = Object.entries(el.attrs)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join("");
    return `<${el.tag}${attrs}>${el.children.map(html).join("")}</${el.tag}>`;
}

function clean(body: string, href = "OEBPS/text/ch1.xhtml") {
    const doc = parseXml(`<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title><style>p{color:red}</style></head><body>${body}</body></html>`);
    const root: Built = { tag: "root", attrs: {}, children: [] };
    const result = sanitizeChapter(bodyOf(doc.documentElement as unknown as SourceNode), root, builder, href);
    return { out: root.children.map(html).join(""), result };
}

describe("an EPUB chapter, rebuilt node by node — never innerHTML (#682)", () => {
    it("keeps the prose: paragraphs, headings, emphasis, lists, tables and quotes", () => {
        const { out } = clean('<h2 id="c3">The Lazy Controller</h2><p>A <em>law</em> of <strong>least</strong> effort.</p><ol start="3"><li>one</li></ol><table><tr><td colspan="2">x</td></tr></table><blockquote>q</blockquote>');
        expect(out).toBe('<h2 data-zf-id="c3">The Lazy Controller</h2><p>A <em>law</em> of <strong>least</strong> effort.</p><ol start="3"><li>one</li></ol><table><tr><td colspan="2">x</td></tr></table><blockquote>q</blockquote>');
    });

    it("keeps what marks a footnote as a fixed flag, never the book's own value (#718)", () => {
        const { out } = clean(
            '<p>Text<a epub:type="noteref" href="#fn1">1</a> and <a role="doc-noteref" href="#fn2">2</a>.</p>' +
                '<aside epub:type="footnote" id="fn1"><p>One.</p></aside><li role="doc-endnote" id="fn2">Two.</li>' +
                '<section epub:type="chapter bodymatter" role="doc-chapter onclick">x</section>'
        );
        expect(out).toBe(
            '<p>Text<a data-zf-noteref="true" data-zf-href="OEBPS/text/ch1.xhtml#fn1">1</a> and <a data-zf-noteref="true" data-zf-href="OEBPS/text/ch1.xhtml#fn2">2</a>.</p>' +
                '<aside data-zf-note="true" data-zf-id="fn1"><p>One.</p></aside><li data-zf-note="true" data-zf-id="fn2">Two.</li>' +
                "<section>x</section>"
        );
    });

    it("drops scripts and everything that runs, with what is inside them", () => {
        const { out } = clean(
            '<script>alert(1)</script><p>safe</p><iframe src="https://evil.example"><p>inside</p></iframe><object data="x.swf"></object><embed src="x"/><form action="https://evil.example"><input value="x"/><button>go</button></form><noscript>ns</noscript><template><p>t</p></template>'
        );
        expect(out).toBe("<p>safe</p>");
    });

    it("drops every on* attribute, style and class: the book reads in your theme", () => {
        const { out } = clean('<p onclick="alert(1)" onmouseover="steal()" style="color:red;position:fixed" class="x" title="a note" lang="en" dir="evil">words</p>');
        expect(out).toBe('<p title="a note" lang="en">words</p>');
    });

    it("never keeps a link that leaves the book — javascript:, data:, http, protocol-relative", () => {
        const { out } = clean(
            '<p><a href="javascript:alert(1)">js</a> <a href="JaVaScRiPt:alert(1)">js2</a> <a href="data:text/html,x">data</a> <a href="https://example.com">web</a> <a href="//evil.example">pr</a></p>'
        );
        expect(out).toBe('<p><span data-zf-outlink="true">js</span> <span data-zf-outlink="true">js2</span> <span data-zf-outlink="true">data</span> <span data-zf-outlink="true">web</span> <span data-zf-outlink="true">pr</span></p>');
    });

    it("keeps a link inside the book as a place: another chapter, or a note in this one", () => {
        const { out } = clean('<p><a href="ch2.xhtml#n3">see</a> <a href="#fn1">1</a> <a href="../text/ch4.xhtml">four</a></p>');
        expect(out).toBe('<p><a data-zf-href="OEBPS/text/ch2.xhtml#n3">see</a> <a data-zf-href="OEBPS/text/ch1.xhtml#fn1">1</a> <a data-zf-href="OEBPS/text/ch4.xhtml">four</a></p>');
    });

    it("shows only images inside the book, as paths to read from the archive — never a URL", () => {
        const { out, result } = clean('<p><img src="../images/fig%201.png" alt="Figure 1" onerror="alert(1)"/><img src="https://tracker.example/pixel.gif"/><img src="data:image/png;base64,AAAA"/></p>');
        expect(out).toBe('<p><img data-zf-src="OEBPS/images/fig 1.png" alt="Figure 1" loading="lazy"></img></p>');
        expect(result.images).toEqual(["OEBPS/images/fig 1.png"]);
    });

    it("turns an SVG cover into its picture, and drops any other SVG with its scripts", () => {
        const { out, result } = clean(
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><script>alert(1)</script><image xlink:href="../images/cover.jpg"/></svg><svg><script>alert(2)</script><foreignObject><p>x</p></foreignObject><a href="javascript:alert(3)"><text>t</text></a></svg>'
        );
        expect(out).toBe('<img data-zf-src="OEBPS/images/cover.jpg" alt="" loading="lazy"></img>');
        expect(result.images).toEqual(["OEBPS/images/cover.jpg"]);
    });

    it("keeps the text of what is harmless but unknown, without its element", () => {
        const { out } = clean('<nav><p>contents</p></nav><center>c</center><custom-tag>kept text</custom-tag><mark>m</mark><!-- a comment --><![CDATA[raw <b>text</b>]]>');
        expect(out).toBe("<div><p>contents</p></div><div>c</div>kept text<span>m</span>raw <b>text</b>");
    });

    it("drops meta, link and base, wherever a book puts them", () => {
        const { out } = clean('<meta http-equiv="refresh" content="0;url=https://evil.example"/><link rel="stylesheet" href="https://evil.example/x.css"/><base href="https://evil.example/"/><p>ok</p>');
        expect(out).toBe("<p>ok</p>");
    });

    it("bounds what a hostile chapter can make it do", () => {
        const deep = "<div>".repeat(200) + "deep" + "</div>".repeat(200);
        const { out } = clean(deep);
        expect(out.split("<div>").length - 1).toBeLessThanOrEqual(64);
    });
});

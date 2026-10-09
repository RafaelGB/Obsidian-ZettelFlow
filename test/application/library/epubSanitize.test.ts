import { describe, it, expect } from "@jest/globals";
import { bodyOf, chapterLanguage, sanitizeChapter, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import { parseXml } from "../../support/miniXml";

/** What the sanitizer built: a tree of plain records, serialised to read like markup. */
interface Built {
    tag: string;
    attrs: Record<string, string>;
    children: (Built | string)[];
    ns?: "svg" | "math";
}

const builder: ChapterBuilder<Built> = {
    element(parent, tag, attrs, ns) {
        const el: Built = { tag, attrs, children: [], ...(ns ? { ns } : {}) };
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
    const tag = el.ns ? `${el.ns}:${el.tag}` : el.tag;
    return `<${tag}${attrs}>${el.children.map(html).join("")}</${tag}>`;
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

    it("turns an SVG cover into its picture, and keeps of any other SVG only what draws (#770)", () => {
        const { out, result } = clean(
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><script>alert(1)</script><image xlink:href="../images/cover.jpg"/></svg><svg><script>alert(2)</script><foreignObject><p>x</p></foreignObject><a href="javascript:alert(3)"><text>t</text></a></svg>'
        );
        expect(out).toBe(
            '<img data-zf-src="OEBPS/images/cover.jpg" alt="" loading="lazy"></img>' +
                '<svg:svg data-zf-drawing="true"><svg:g data-zf-outlink="true"><svg:text>t</svg:text></svg:g></svg:svg>'
        );
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

describe("a passage's own language (#757 AC-3)", () => {
    it("keeps xml:lang as lang, and drops a value that is not a language", () => {
        expect(clean('<p xml:lang="fr">Bonjour</p>').out).toBe('<p lang="fr">Bonjour</p>');
        expect(clean('<p xml:lang="not a tag">x</p>').out).toBe("<p>x</p>");
        expect(clean('<p lang="de" xml:lang="fr">x</p>').out).toBe('<p lang="de">x</p>');
    });

    it("reads a chapter's language from its body, else from its html", () => {
        const chapter = (open: string, body = "<body>") => parseXml(`${open}<head><title>t</title></head>${body}<p>x</p></body></html>`).documentElement as unknown as SourceNode;
        expect(chapterLanguage(chapter('<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ca">'))).toBe("ca");
        expect(chapterLanguage(chapter('<html xmlns="http://www.w3.org/1999/xhtml" lang="es">', '<body lang="gl">'))).toBe("gl");
        expect(chapterLanguage(chapter('<html xmlns="http://www.w3.org/1999/xhtml">'))).toBeUndefined();
        expect(chapterLanguage(chapter('<html xmlns="http://www.w3.org/1999/xhtml" lang="x y">'))).toBeUndefined();
    });
});

describe("MathML in a chapter (#770)", () => {
    it("rebuilds a fraction in the MathML namespace, element by element", () => {
        const { out } = clean("<p>so <math><mfrac><mi>a</mi><mi>b</mi></mfrac></math> holds</p>");
        expect(out).toBe("<p>so <math:math><math:mfrac><math:mi>a</math:mi><math:mi>b</math:mi></math:mfrac></math:math> holds</p>");
    });

    it("keeps the layout attributes and drops colour, style, class, links and handlers", () => {
        const { out } = clean(
            '<math display="block" mathcolor="red" mathbackground="#000" style="color:red" class="x" href="https://e.example" onclick="x()" xlink:href="https://e.example"><mstyle displaystyle="true"><mi mathvariant="bold" mathcolor="red" href="#x">x</mi></mstyle></math>'
        );
        expect(out).toBe('<math:math display="block"><math:mstyle displaystyle="true"><math:mi mathvariant="bold">x</math:mi></math:mstyle></math:math>');
    });

    it("keeps of a semantics wrapper only its presentation: no TeX, no XHTML annotation", () => {
        const { out } = clean(
            '<math><semantics><mrow><mi>x</mi></mrow><annotation encoding="TeX">\\frac{a}{b}</annotation><annotation-xml encoding="application/xhtml+xml"><p onclick="x">para</p></annotation-xml></semantics></math>'
        );
        expect(out).toBe("<math:math><math:mrow><math:mi>x</math:mi></math:mrow></math:math>");
    });

    it("shows Content MathML as its alternative text, or else its text — never an empty equation (FR-3)", () => {
        expect(clean('<p><math alttext="a over b"><apply><divide/><ci>a</ci><ci>b</ci></apply></math></p>').out).toBe("<p>a over b</p>");
        expect(clean("<p><math><apply><plus/><ci>a</ci><ci>b</ci></apply><annotation>TeX</annotation></math></p>").out).toBe("<p>ab</p>");
    });

    it("keeps an equation's alternative text, at most 500 characters", () => {
        const { out } = clean(`<math alttext="${"a".repeat(600)}"><mi>a</mi></math>`);
        expect(out).toBe(`<math:math alttext="${"a".repeat(500)}"><math:mi>a</math:mi></math:math>`);
    });

    it("draws mfenced as a row between its fences, which MathML Core no longer draws", () => {
        const { out } = clean('<math><mfenced open="[" close="]"><mi>x</mi><mi>y</mi></mfenced></math>');
        expect(out).toBe("<math:math><math:mrow><math:mo>[</math:mo><math:mi>x</math:mi><math:mo>,</math:mo><math:mi>y</math:mi><math:mo>]</math:mo></math:mrow></math:math>");
    });

    it("drops mglyph, which fetches a picture", () => {
        expect(clean('<math><mi>x</mi><mglyph src="https://x.example/g.png" alt="g"/></math>').out).toBe("<math:math><math:mi>x</math:mi></math:math>");
    });

    it("keeps only the text of HTML inside a token", () => {
        expect(clean('<math><mi><span class="x" onclick="y">y</span></mi></math>').out).toBe("<math:math><math:mi>y</math:mi></math:math>");
    });

    it("keeps of maction the child it selects, and of a labelled row its row", () => {
        expect(clean('<math><maction actiontype="toggle" selection="2"><mi>a</mi><mi>b</mi></maction></math>').out).toBe("<math:math><math:mi>b</math:mi></math:math>");
        expect(clean("<math><mtable><mlabeledtr><mtd><mtext>(1)</mtext></mtd><mtd><mi>x</mi></mtd></mlabeledtr></mtable></math>").out).toBe(
            "<math:math><math:mtable><math:mtr><math:mtd><math:mi>x</math:mi></math:mtd></math:mtr></math:mtable></math:math>"
        );
    });

    it("reads math as MathML whatever namespace the parser gave it", () => {
        expect(clean('<math xmlns="http://www.w3.org/1999/xhtml"><msqrt><mn>2</mn></msqrt></math>').out).toBe("<math:math><math:msqrt><math:mn>2</math:mn></math:msqrt></math:math>");
    });
});

describe("inline SVG in a chapter (#770)", () => {
    const draw = (inner: string, attrs = "") => clean(`<svg${attrs}>${inner}</svg>`);
    const SCOPED = /zf-s\d+-/g;

    it("keeps a drawing in the SVG namespace, flagged, with the box it is laid out in", () => {
        const { out } = draw(
            '<circle cx="5" cy="5" r="4" fill="#336699"/><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor"/>',
            ' xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet" onload="x()"'
        );
        expect(out).toBe(
            '<svg:svg width="100" height="50" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet" data-zf-drawing="true"><svg:circle cx="5" cy="5" r="4" fill="#336699"></svg:circle><svg:line x1="0" y1="0" x2="10" y2="10" stroke="currentColor"></svg:line></svg:svg>'
        );
    });

    it("drops a script, and its text", () => {
        const { out } = draw('<script>alert(1)</script><circle r="2"/>');
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:circle r="2"></svg:circle></svg:svg>');
        expect(out).not.toContain("alert");
    });

    it("drops foreignObject with everything inside it", () => {
        const { out } = draw('<foreignObject width="9"><p>inside</p><math><mi>m</mi></math></foreignObject><rect width="1" height="1"/>');
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:rect width="1" height="1"></svg:rect></svg:svg>');
    });

    it("never keeps a javascript: link — its text, and no href anywhere", () => {
        const { out } = draw('<a xlink:href="javascript:alert(1)"><text>t</text></a>');
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:g data-zf-outlink="true"><svg:text>t</svg:text></svg:g></svg:svg>');
        expect(out).not.toContain("href");
    });

    it("keeps a link that leaves the book as plain text, inside a label too", () => {
        const { out } = draw('<text>go <a href="https://example.com">out</a></text>');
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:text>go <svg:tspan data-zf-outlink="true">out</svg:tspan></svg:text></svg:svg>');
    });

    it("keeps a link to a place in the book as a place, never as an href", () => {
        const { out } = draw('<a href="ch2.xhtml#f"><text>in</text></a>');
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:a data-zf-href="OEBPS/text/ch2.xhtml#f"><svg:text>in</svg:text></svg:a></svg:svg>');
    });

    it("drops every on* and the style attribute, promoting only what it allows", () => {
        const { out } = draw('<rect onload="x" onclick="y" width="4" style="fill:red;behavior:url(x.htc);position:fixed;stroke-width:2"/>');
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:rect width="4" fill="red" stroke-width="2"></svg:rect></svg:svg>');
    });

    it("keeps a use only when it points inside the same drawing", () => {
        const { out } = draw(
            '<defs><circle id="local" r="1"/></defs><use href="https://evil.example/x.svg#a"/><use href="other.svg#a"/><use xlink:href="data:image/svg+xml,x"/><use href="#missing"/><use href="#local"/>'
        );
        expect(out.replace(SCOPED, "zf-sN-")).toBe(
            '<svg:svg data-zf-drawing="true"><svg:defs><svg:circle id="zf-sN-local" data-zf-id="local" r="1"></svg:circle></svg:defs><svg:use href="#zf-sN-local"></svg:use></svg:svg>'
        );
    });

    it("shows a picture only from inside the book, read from the archive", () => {
        const { out, result } = draw('<image href="https://tracker.example/p.png"/><image href="data:image/png;base64,AA"/><image href="../images/fig.png" width="10" height="5"/><circle r="1"/>');
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:image width="10" height="5" data-zf-src="OEBPS/images/fig.png"></svg:image><svg:circle r="1"></svg:circle></svg:svg>');
        expect(result.images).toEqual(["OEBPS/images/fig.png"]);
    });

    it("never lets a paint, a clip or a marker name anything outside the drawing; filters go whole", () => {
        const { out } = draw(
            '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><filter id="f"><feImage href="https://x.example"/></filter></defs><rect fill="url(https://evil.example/#g)" filter="url(#f)" clip-path="url(//evil.example/#c)" marker-end="url(data:x)"/><rect fill="url(#g) red"/>'
        );
        expect(out.replace(SCOPED, "zf-sN-")).toBe(
            '<svg:svg data-zf-drawing="true"><svg:defs><svg:linearGradient id="zf-sN-g" data-zf-id="g"><svg:stop offset="0" stop-color="#fff"></svg:stop></svg:linearGradient></svg:defs><svg:rect fill="none"></svg:rect><svg:rect fill="url(#zf-sN-g) red"></svg:rect></svg:svg>'
        );
        expect(out).not.toMatch(/filter|feImage|evil|data:/);
        // A paint whose gradient is not in the drawing paints nothing, as the platform would.
        expect(draw('<rect fill="url(#nowhere)"/>').out).toBe('<svg:svg data-zf-drawing="true"><svg:rect fill="none"></svg:rect></svg:svg>');
    });

    it("drops a value that hides a url behind a CSS escape", () => {
        const { out } = draw('<rect fill="u\\72l(https://x.example)" stroke="url(&quot;https://x.example&quot;)" style="fill:u\\rl(x)"/>');
        // The escaped values are gone; the quoted remote url paints nothing, and fetches nothing.
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:rect stroke="none"></svg:rect></svg:svg>');
    });

    it("never plays a book's animation (FR-11)", () => {
        const { out } = draw(
            '<rect width="1"><animate attributeName="x" to="9"/><set attributeName="fill" to="red"/><animateTransform attributeName="transform"/></rect><path id="p" d="M0 0"/><circle r="1"><animateMotion><mpath href="#p"/></animateMotion></circle><style>@keyframes k{}</style>'
        );
        expect(out).not.toMatch(/animate|svg:set|mpath|style|keyframes/i);
        expect(out).toContain('<svg:rect width="1"></svg:rect>');
    });

    it("scopes two drawings' ids apart, each url(#…) pointing at its own", () => {
        const one = '<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>';
        const { out } = clean(one + one);
        const ids = [...out.matchAll(/id="(zf-s\d+-g)"/g)].map((m) => m[1]);
        const fills = [...out.matchAll(/fill="url\(#(zf-s\d+-g)\)"/g)].map((m) => m[1]);
        expect(ids).toHaveLength(2);
        expect(ids[0]).not.toBe(ids[1]);
        expect(fills).toEqual(ids);
    });

    it("bounds use: never one whose target holds a use, never more than 256", () => {
        const nested = draw('<defs><g id="a"><use href="#b"/></g><circle id="b" r="1"/><g id="s"><use href="#s"/></g></defs><use href="#a"/><use href="#b"/>').out.replace(SCOPED, "");
        expect(nested).not.toContain('href="#a"');
        expect(nested).not.toContain('href="#s"');
        expect(nested.match(/<svg:use/g)).toHaveLength(2);
        const many = draw('<defs><circle id="b" r="1"/></defs>' + '<use href="#b"/>'.repeat(300)).out;
        expect(many.match(/<svg:use/g)).toHaveLength(256);
    });

    it("keeps only the text a drawing draws: its labels, never stray words between shapes", () => {
        const { out } = draw('stray<g>words<text x="1 2 3">kept</text></g><title>A chart</title>');
        expect(out).toBe('<svg:svg data-zf-drawing="true"><svg:g><svg:text x="1 2 3">kept</svg:text></svg:g><svg:title>A chart</svg:title></svg:svg>');
    });

    it("keeps an HTML element out of a drawing, and an equation with it", () => {
        expect(draw('<p>para</p><math><mi>x</mi></math><circle r="1"/>').out).toBe('<svg:svg data-zf-drawing="true"><svg:circle r="1"></svg:circle></svg:svg>');
    });
});

describe("the cover, and the budget, through equations and drawings (#770)", () => {
    it("still turns a cover with a title and defs into its picture (AC-3)", () => {
        const { out } = clean('<svg><title>Cover</title><defs/><image href="cover.jpg"/></svg>');
        expect(out).toBe('<img data-zf-src="OEBPS/text/cover.jpg" alt="" loading="lazy"></img>');
    });

    it("counts equations and drawings in the element budget (AC-4)", () => {
        expect(clean('<math><mi>a</mi></math><svg><circle r="1"/></svg>').result.elements).toBe(4);
        const { result } = clean(`<math>${"<mi>x</mi>".repeat(70_000)}</math>`);
        expect(result.elements).toBe(60_000);
    });

    it("bounds the depth inside a drawing, and the length of its path data", () => {
        const deep = clean(`<svg>${"<g>".repeat(200)}<circle r="1"/>${"</g>".repeat(200)}</svg>`).out;
        expect(deep.split("<svg:g>").length - 1).toBeLessThanOrEqual(64);
        const long = clean(`<svg><path d="M${" 0".repeat(40_000)}"/><polygon points="${"0,".repeat(40_000)}0"/></svg>`).out;
        expect(long).toBe('<svg:svg data-zf-drawing="true"><svg:path></svg:path><svg:polygon></svg:polygon></svg:svg>');
    });
});

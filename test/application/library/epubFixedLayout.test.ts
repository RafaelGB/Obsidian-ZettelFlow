import { describe, it, expect } from "@jest/globals";
import {
    MAX_CSS_BYTES,
    bindAssets,
    cleanDesignedCss,
    defendRules,
    designedCssBook,
    designedHead,
    DesignedCssError,
    type DesignedCssBook,
    type RuleLike,
} from "application/library/epubFixedLayout";
import { bodyOf, sanitizeChapter, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import { parseXml } from "../../support/miniXml";

/**
 * **The book's CSS, cleaned** (#771 AC-3) — the security boundary of a designed page, against the
 * hostile fixtures the plan names, each on its own. What is left may only draw the page it is on.
 */

const HREF = "OEBPS/css/page.css";
const PAGE = "OEBPS/pages/p1.xhtml";

function clean(text: string, book: DesignedCssBook = designedCssBook("k")) {
    return cleanDesignedCss({ sheets: [{ text, href: HREF }], inline: [], href: PAGE }, book);
}

/** What survives of `text`, as one line. */
const kept = (text: string, book?: DesignedCssBook) => clean(text, book).css;

describe("a designed page's CSS reaches nothing outside the book (FR-4)", () => {
    it("drops @import in both forms", () => {
        expect(kept('@import url(https://x/a.css); p{color:red}')).toBe("p{color:red}");
        expect(kept('@import "a.css"; p{color:red}')).toBe("p{color:red}");
    });

    it("drops a declaration whose url() leaves the book: remote, protocol-relative, data and javascript", () => {
        for (const url of ["https://x/p.png", "//x/p.png", "data:image/png;base64,AAAA", "javascript:alert(1)", '"https://x/p.png"', "#frag"]) {
            expect(kept(`p{color:red;background:url(${url})}`)).toBe("p{color:red}");
        }
    });

    it("makes an in-book url() a placeholder, with the file it names", () => {
        const out = clean("p{background:url(../img/p1.jpg) no-repeat}div{background-image:url('../img/p1.jpg')}");
        expect(out.css).toBe('p{background:url("zf-asset:0") no-repeat}\ndiv{background-image:url("zf-asset:0")}');
        expect(out.assets).toEqual(["OEBPS/img/p1.jpg"]);
    });

    it("never loads a remote font, and never renames a family the book does not carry", () => {
        const book = designedCssBook("k");
        expect(kept('@font-face{font-family:Inter;src:url(https://fonts.example/i.woff2)} p{font-family:Inter, sans-serif}', book)).toBe("p{font-family:Inter, sans-serif}");
        expect(book.fonts).toEqual([]);
    });

    it("loads an in-book font under our own name, and renames the family wherever it is used", () => {
        const book = designedCssBook("Book 7!");
        const css = kept(
            '@font-face{font-family:"Comic";src:local("Comic"), url(../fonts/c.woff2) format("woff2");font-weight:700;font-style:italic} h1{font-family:"Comic", serif} p{font:italic 12px Comic}',
            book
        );
        expect(book.fonts).toEqual([{ family: "zf-fxl-book7-0", path: "OEBPS/fonts/c.woff2", weight: "700", style: "italic" }]);
        expect(css).toBe('h1{font-family:"zf-fxl-book7-0", serif}\np{font:italic 12px "zf-fxl-book7-0"}');
        expect(css).not.toContain("@font-face");
    });

    it("drops anything written with a CSS escape", () => {
        expect(kept("p{background:u\\72l(https://x)} a{color:red}")).toBe("a{color:red}");
        expect(kept("\\@import url(https://x/a.css); a{color:red}")).toBe("a{color:red}");
        expect(kept(".a\\:b{color:red} a{color:blue}")).toBe("a{color:blue}");
    });

    it("drops every function not on the closed list", () => {
        for (const value of ['image-set("https://x" 1x)', "src(var(--u))", "cross-fade(url(a.png), url(b.png), 50%)", "element(#a)", "paint(x)", "attr(data-x url)", "env(safe-area-inset-top)", "expression(alert(1))", "-webkit-image-set(url(a.png) 1x)", "image(url(a.png))"]) {
            expect(kept(`p{color:red;background:${value}}`)).toBe("p{color:red}");
        }
        expect(kept("p{width:calc(100% - (2 * 4px));color:rgb(0 0 0 / 50%)}")).toBe("p{width:calc(100% - (2 * 4px));color:rgb(0 0 0 / 50%)}");
    });

    it("drops a custom property that carries a URL", () => {
        expect(kept("p{--u:url(https://x);--v:url(a.png);--w:12px;color:red}")).toBe("p{--w:12px;color:red}");
    });
});

describe("what the security review of #771 found (S1–S4)", () => {
    it("drops a value whose url( sits inside a string, so a rewrite can never move where strings end", () => {
        // The probe the review found: whatever survives, it holds neither function.
        for (const probe of [`p::before{content: 'url("a'b")' image-set("https://e/x.png" 1x)
}`, `p{content: 'url("a'b")' attr(data-zf-src)
}`]) {
            const out = kept(`${probe} q{color:red}`);
            expect(out).not.toMatch(/image-set|attr\(|zf-asset/);
        }
        expect(kept(`p::before{content: "see url(x.png)"} q{color:red}`)).toBe("q{color:red}");
    });

    it("drops :scope and & — at the top of a shadow tree's sheet they match its host", () => {
        expect(kept(":scope{contain:none !important} &{color:red} .a &{color:red} p{color:blue}")).toBe("p{color:blue}");
    });

    it("keeps only a plain position: a var() or -webkit-sticky never makes a box fixed", () => {
        expect(kept(".a{position:var(--p);color:red} .b{position:-webkit-sticky} .c{position:relative} .d{view-transition-name:x;color:red}")).toBe(
            ".a{color:red}\n.b{position:absolute}\n.c{position:relative}\n.d{color:red}"
        );
    });

    it("fails a page whose styles name more than a thousand files, calmly and fast", () => {
        const text = Array.from({ length: 1200 }, (_, i) => `.r${i}{background:url(img/${i}.png)}`).join("");
        expect(() => kept(text)).toThrow(DesignedCssError);
    });

    it("deletes after parsing any rule that still calls a fetching function, or reaches the host", () => {
        const deleted: number[] = [];
        const rules: RuleLike[] = [
            { cssText: 'p { background: image-set("https://x/a.png" 1x); }' },
            { cssText: ":scope { contain: none; }" },
            { cssText: "& { color: red; }" },
            { cssText: 'p { content: attr(data-x); }' },
            // Conservative: an & anywhere in the selector, even in a string, is refused.
            { cssText: 'a[title="&"] { color: red; }' },
            { cssText: "p:not(.a) { color: red; }" },
        ];
        defendRules({ cssRules: rules, deleteRule: (i: number) => deleted.push(i) }, new Set());
        expect(deleted).toEqual([4, 3, 2, 1, 0]);
    });
});

describe("a designed page's CSS stays inside its page (FR-3)", () => {
    it("drops every rule aimed at the host, a slot or a part", () => {
        expect(kept(":host{display:none} :host(.a) p{color:red} ::slotted(p){color:red} x::part(y){color:red} p{color:blue}")).toBe("p{color:blue}");
    });

    it("keeps the page's boxes inside it: fixed and sticky become absolute", () => {
        expect(kept(".b{position:fixed;top:0} .c{position:sticky}")).toBe(".b{position:absolute;top:0}\n.c{position:absolute}");
    });

    it("makes html, :root and body the page's own", () => {
        expect(kept("html{font-size:10px} :root{--x:1px} body{margin:0} html body .p{color:red} .body, #html, tbody{color:blue}")).toBe(
            "[data-zf-html]{font-size:10px}\n[data-zf-html]{--x:1px}\n[data-zf-body]{margin:0}\n[data-zf-html] [data-zf-body] .p{color:red}\n.body, #html, tbody{color:blue}"
        );
    });

    it("keeps @media and @supports, cleaned inside; every other at-rule goes", () => {
        expect(kept("@media (min-width: 100px){p{color:red;background:url(https://x)}} @page{margin:0} @namespace svg url(x); @layer a{p{color:red}} @container (x){p{color:red}}")).toBe(
            "@media (min-width: 100px){p{color:red}}"
        );
    });
});

describe("a designed page's own motion never plays (FR-15)", () => {
    it("drops animation, transition and @keyframes, prefixed too", () => {
        expect(kept("@keyframes spin{to{transform:rotate(1turn)}} .s{animation:spin 1s infinite;-webkit-animation-name:spin;transition:all .2s;color:red}")).toBe(".s{color:red}");
    });

    it("drops what binds or reaches out: behavior, -moz-binding, pointer-events, user-select", () => {
        expect(kept("p{behavior:url(x.htc);-moz-binding:url(x.xml#a);pointer-events:none;user-select:all;-webkit-touch-callout:default;color:red}")).toBe("p{color:red}");
    });
});

describe("a designed page's CSS within its caps (FR-10)", () => {
    it("throws past 512 KB, which the page shows as its calm line", () => {
        expect(() => kept("p{color:red}".padEnd(MAX_CSS_BYTES + 10, " "))).toThrow(DesignedCssError);
    });

    it("throws past 5,000 rules", () => {
        expect(() => kept(Array.from({ length: 6000 }, (_, i) => `.r${i}{color:red}`).join(""))).toThrow(DesignedCssError);
    });
});

describe("the placeholders bound, and the second check after parsing (#771)", () => {
    it("binds each placeholder to the URL minted for it, and draws nothing for one with none", () => {
        expect(bindAssets('p{background:url("zf-asset:0")} q{background:url("zf-asset:1")}', ["blob:app://o/1"])).toBe('p{background:url("blob:app://o/1")} q{background:none}');
        expect(bindAssets('p{background:url("zf-asset:0")}', ["https://x"])).toBe("p{background:none}");
    });

    it("deletes a rule naming a URL we did not mint, an import, a font, the host — and keeps ours", () => {
        const deleted: number[] = [];
        const rules: RuleLike[] = [
            { cssText: '@import url("https://x/a.css");' },
            { cssText: 'p { background: url("https://x/p.png"); }' },
            { cssText: ":host { display: none; }" },
            { cssText: 'q { background: url("blob:app://o/1"); }' },
            { cssText: "@font-face { font-family: x; }" },
            { cssText: "a:not(.b) { color: red; }" },
        ];
        const sheet = { cssRules: rules, deleteRule: (i: number) => deleted.push(i) };
        expect(defendRules(sheet, new Set(["blob:app://o/1"]))).toBe(4);
        expect(deleted).toEqual([4, 2, 1, 0]);
    });

    it("reads inside @media too", () => {
        const inner: number[] = [];
        const media = { cssText: "@media print { p { background: url(\"https://x\"); } }", cssRules: [{ cssText: 'p { background: url("https://x"); }' }], deleteRule: (i: number) => inner.push(i) };
        const outer: number[] = [];
        defendRules({ cssRules: [media], deleteRule: (i) => outer.push(i) }, new Set());
        expect(inner).toEqual([0]);
    });
});

// ── the designed policy of the one sanitiser ─────────────────────────────

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
    return `<${el.tag}${attrs}>${el.children.map(html).join("")}</${el.tag}>`;
}

function page(head: string, body: string) {
    const doc = parseXml(`<html xmlns="http://www.w3.org/1999/xhtml"><head>${head}</head><body>${body}</body></html>`);
    const root = doc.documentElement as unknown as SourceNode;
    const into: Built = { tag: "root", attrs: {}, children: [] };
    const result = sanitizeChapter(bodyOf(root), into, builder, PAGE, { policy: "designed" });
    return { out: into.children.map(html).join(""), result, head: designedHead(root, PAGE) };
}

describe("a designed page, rebuilt by the one sanitiser (#771 T4)", () => {
    it("keeps class and id, and moves an inline style to a rule — never a style attribute", () => {
        const { out, result } = page("", '<p class="balloon" id="b1" style="left:12px;top:40px;background:url(https://x)">Hi</p>');
        expect(out).toBe('<p data-zf-id="b1" class="balloon" id="b1" data-zf-s="0">Hi</p>');
        expect(out).not.toContain("style=");
        expect(result.inline).toEqual(["left:12px;top:40px;background:url(https://x)"]);
        const css = cleanDesignedCss({ sheets: [], inline: result.inline ?? [], href: PAGE }, designedCssBook("k")).css;
        expect(css).toBe('[data-zf-s="0"]{left:12px;top:40px}');
    });

    it("still drops script, handlers and a link out of the book, as #682", () => {
        const { out } = page("", '<div onclick="x()"><script>alert(1)</script><a href="https://x">out</a><img src="../img/a.png" onload="x()" width="300" height="200"/></div>');
        expect(out).not.toContain("script");
        expect(out).not.toContain("onclick");
        expect(out).not.toContain("onload");
        expect(out).toContain('<span data-zf-outlink="true">out</span>');
        expect(out).toContain('<img width="300" height="200" data-zf-src="OEBPS/img/a.png" alt="">');
    });

    it("collects the in-book stylesheet links and style text of its head, ignores a remote one, and builds neither", () => {
        const { out, head, result } = page(
            '<meta name="viewport" content="width=600, height=800"/><link rel="stylesheet" href="../css/p.css"/><link rel="stylesheet" href="https://x.css"/><link rel="alternate stylesheet" href="../css/alt.css"/><style>p{color:red}</style>',
            "<style>q{color:blue}</style><p>x</p>"
        );
        expect(head).toEqual({ viewport: { width: 600, height: 800 }, sheets: ["OEBPS/css/p.css"], styles: ["p{color:red}"] });
        expect(result.styles).toEqual(["q{color:blue}"]);
        expect(out).toBe("<p>x</p>");
    });

    it("keeps a drawing whole on a designed page, by #770's list", () => {
        const { out, result } = page("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><image width="600" height="800" href="../img/p.jpg"/><script>x()</script></svg>');
        expect(out).toContain('data-zf-drawing="true"');
        expect(out).toContain('data-zf-src="OEBPS/img/p.jpg"');
        expect(out).not.toContain("script");
        expect(result.images).toEqual(["OEBPS/img/p.jpg"]);
    });

    it("leaves the flowing policy exactly as it was", () => {
        const doc = parseXml('<html xmlns="http://www.w3.org/1999/xhtml"><body><p class="a" style="color:red">x</p><style>p{}</style></body></html>');
        const into: Built = { tag: "root", attrs: {}, children: [] };
        const result = sanitizeChapter(bodyOf(doc.documentElement as unknown as SourceNode), into, builder, PAGE);
        expect(into.children.map(html).join("")).toBe("<p>x</p>");
        expect("inline" in result).toBe(false);
    });
});

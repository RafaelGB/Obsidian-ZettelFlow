import { describe, it, expect } from "@jest/globals";
import { shownParts, splitEntry } from "application/library/stardict";
import { DICTIONARY_PROFILE, sanitizeNodes, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import { parseXml } from "../../../support/miniXml";

/** **Showing an entry** (#766 FR-7, AC-3): its parts split, and the markup rebuilt by the dictionary profile. */
const enc = new TextEncoder();
const bytes = (...parts: (string | number[])[]) => {
    const chunks = parts.map((p) => (typeof p === "string" ? enc.encode(p) : Uint8Array.from(p)));
    const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.length;
    }
    return out;
};
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe("an entry's parts (#766 FR-7)", () => {
    it("splits by sametypesequence: text parts NUL-terminated, the last to the end", () => {
        const parts = splitEntry(bytes("ˈka.sa", [0], "Edificio."), "tm");
        expect(parts.map((p) => [p.type, text(p.data)])).toEqual([["t", "ˈka.sa"], ["m", "Edificio."]]);
    });

    it("splits typed parts, binary ones by their size, and stops at a part cut short", () => {
        const parts = splitEntry(bytes("m", "one", [0], "W", [0, 0, 0, 2], [9, 9], "h", "<b>x</b>", [0]));
        expect(parts.map((p) => p.type)).toEqual(["m", "W", "h"]);
        expect(splitEntry(bytes("W", [0, 0, 0, 9], [1])).length).toBe(0);
    });

    it("shows text and phonetics as text, markup as markup, and leaves media and unknown types out", () => {
        const shown = shownParts(splitEntry(bytes("t", "ˈka.sa", [0], "m", "Edificio.", [0], "h", "<i>f.</i>", [0], "x", "<k>casa</k>", [0], "g", "<b>g</b>", [0], "W", [0, 0, 0, 1], [7], "r", "img:a.png", [0], "k", "kingsoft", [0])));
        expect(shown).toEqual([
            { kind: "text", text: "ˈka.sa", phonetic: true },
            { kind: "text", text: "Edificio.", phonetic: false },
            { kind: "markup", markup: "html", text: "<i>f.</i>" },
            { kind: "markup", markup: "xdxf", text: "<k>casa</k>" },
            { kind: "markup", markup: "pango", text: "<b>g</b>" },
        ]);
    });
});

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
    text(parent, value) {
        parent.children.push(value);
    },
};
const html = (el: Built | string): string =>
    typeof el === "string" ? el : `<${el.tag}${Object.entries(el.attrs).map(([k, v]) => ` ${k}="${v}"`).join("")}>${el.children.map(html).join("")}</${el.tag}>`;
function clean(markup: string): string {
    const doc = parseXml(`<root>${markup}</root>`);
    const root: Built = { tag: "root", attrs: {}, children: [] };
    sanitizeNodes(doc.documentElement as unknown as SourceNode, root, builder, DICTIONARY_PROFILE);
    return root.children.map(html).join("");
}

describe("the dictionary profile of the sanitiser (#766 AC-3)", () => {
    it("keeps emphasis and lists", () => {
        expect(clean("<b>casa</b> <i>f.</i><ul><li>uno</li><li>dos</li></ul>")).toBe("<b>casa</b> <i>f.</i><ul><li>uno</li><li>dos</li></ul>");
    });

    it("drops scripts, styles, pictures and handlers, and keeps a link's text without the link", () => {
        expect(clean('<script>alert(1)</script><style>b{}</style><p onclick="x()">Ver <a href="https://example.com/casa">casa</a>.</p><img src="a.png"/><svg><circle/></svg>')).toBe(
            "<p>Ver <span>casa</span>.</p>"
        );
    });

    it("renames XDXF and Pango to what they mean, and keeps no colour", () => {
        expect(clean('<k>casa</k> <abr>f.</abr> <dtrn>house</dtrn> <ex>mi casa</ex> <kref>hogar</kref> <c c="red">x</c>')).toBe(
            "<strong>casa</strong> <abbr>f.</abbr> <span>house</span> <em>mi casa</em> <span>hogar</span> <span>x</span>"
        );
        expect(clean('<span foreground="red" size="large">rojo</span> <big>B</big> <tt>t</tt>')).toBe("<span>rojo</span> <span>B</span> <code>t</code>");
    });

    it("keeps lang, and no other attribute", () => {
        expect(clean('<span lang="en" class="x" id="y" title="t">house</span>')).toBe('<span lang="en">house</span>');
    });
});

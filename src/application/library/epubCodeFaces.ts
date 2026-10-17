/**
 * **The classes a book sets its code in** (#824 FR-12) — pure.
 *
 * Converted books (Calibre, most of what is sold as EPUB) rarely write `<pre>`: a listing is one
 * paragraph per line, `<p class="class_sc">private void …</p>`, and only the book's stylesheet says
 * those lines are code — by setting them in a typewriter face. The Reader never applies a book's
 * stylesheet (§XV); it reads it for **one fact**: which classes are set in a monospace face, and how
 * much further a code class indents than the listing's base. Nothing else of it is kept or used.
 */

export interface CodeFaces {
    /** Classes whose rule sets a monospace face. */
    mono: ReadonlySet<string>;
    /** Of those, the classes that indent past the listing's base, in spaces (4 a step). */
    indent: ReadonlyMap<string, number>;
}

export const NO_CODE_FACES: CodeFaces = { mono: new Set(), indent: new Map() };

/**
 * A face a code font has, family by family: the generic `monospace`, or a name a code font goes by —
 * a typewriter, a mono (never *Monotype*, a foundry that makes book faces), Courier, Consolas, Menlo…
 */
const MONO_FAMILY = /^monospace$|typewriter|courier|consol|menlo|inconsolata|\bmono\b|mono$|^mono|\bcode\b|fixedsys|terminal/i;

function setsCode(families: string): boolean {
    return families
        .split(",")
        .map((family) => family.trim().replace(/^["']|["']$/g, ""))
        .some((family) => !/monotype/i.test(family) && MONO_FAMILY.test(family));
}

/** A selector that names one class, alone or on an element (`.x`, `p.x`, `span.x`). */
const ONE_CLASS = /^(?:[a-z][a-z0-9]*)?\.([\w-]{1,80})$/i;

/** How far a declaration indents: `text-indent` and `margin-left` / `padding-left`, in % or em. */
function indentOf(block: string): number | null {
    let total = 0;
    let seen = false;
    for (const property of ["text-indent", "margin-left", "padding-left"]) {
        const match = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*(-?[\\d.]+)(%|em|rem)?`, "i").exec(block);
        if (!match) continue;
        const value = parseFloat(match[1]);
        if (!Number.isFinite(value)) continue;
        // A step of indentation: about 7.5 % of a column, or 2 em.
        total += match[2] === "%" ? value / 7.5 : match[2] ? value / 2 : 0;
        seen = true;
    }
    // `margin: 0 0 0 4.7%` — the shorthand's fourth value is the left one.
    const shorthand = /(?:^|[;{\s])margin\s*:\s*([^;}]+)/i.exec(block);
    if (shorthand) {
        const parts = shorthand[1].trim().split(/\s+/);
        const left = parts.length === 4 ? parts[3] : parts.length >= 2 ? parts[1] : parts[0];
        const match = /^(-?[\d.]+)(%|em|rem)?$/.exec(left);
        if (match) {
            total += match[2] === "%" ? parseFloat(match[1]) / 7.5 : match[2] ? parseFloat(match[1]) / 2 : 0;
            seen = true;
        }
    }
    return seen ? total : null;
}

/** The book's stylesheets, read for which classes set code — bounded, so a hostile one costs nothing. */
export function codeFacesOf(css: string): CodeFaces {
    const mono = new Set<string>();
    const steps = new Map<string, number>();
    const text = css.slice(0, 512 * 1024).replace(/\/\*[\s\S]*?\*\//g, "");
    // A scanner, one pass, never a regex over the whole sheet: a hostile sheet with no braces would make
    // a backtracking rule quadratic (#824 review: 512 KB took ~100 s), and this runs as a chapter opens.
    let at = 0;
    let rules = 0;
    while (at < text.length && rules++ < 20_000) {
        const open = text.indexOf("{", at);
        if (open < 0) break;
        const close = text.indexOf("}", open + 1);
        if (close < 0) break;
        const selectors = text.slice(text.lastIndexOf("}", open) + 1, open);
        const block = text.slice(open + 1, close);
        at = close + 1;
        // A nested block (`@media { .x { … } }`): its own rule starts after the inner brace.
        const inner = block.lastIndexOf("{");
        const declarations = inner >= 0 ? block.slice(inner + 1) : block;
        const head = inner >= 0 ? block.slice(0, inner) : selectors;
        if (head.includes("@")) continue;
        const family = /font-family\s*:\s*([^;}]+)/i.exec(declarations);
        if (!family || !setsCode(family[1])) continue;
        const indent = indentOf(declarations);
        for (const selector of head.split(",")) {
            const one = ONE_CLASS.exec(selector.trim());
            if (!one) continue;
            mono.add(one[1]);
            if (indent !== null) steps.set(one[1], indent);
        }
    }
    let base = Number.POSITIVE_INFINITY;
    for (const value of steps.values()) base = Math.min(base, value);
    const indent = new Map<string, number>();
    for (const [name, value] of steps) {
        const spaces = Math.round(value - (Number.isFinite(base) ? base : 0)) * 4;
        if (spaces > 0) indent.set(name, Math.min(spaces, 32));
    }
    return { mono, indent };
}

/** The stylesheets a chapter links to (`<link rel="stylesheet" href="…">`), as written. */
export function linkedStylesheets(xhtml: string): string[] {
    const out: string[] = [];
    for (const link of xhtml.slice(0, 64 * 1024).match(/<link\b[^>]*>/gi) ?? []) {
        if (!/rel\s*=\s*["'][^"']*stylesheet/i.test(link)) continue;
        const href = /href\s*=\s*["']([^"']{1,300})["']/i.exec(link)?.[1];
        if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href)) out.push(href);
    }
    return out;
}

/**
 * **Equations and drawings: the closed lists** (#770, epic #739) — pure.
 *
 * A chapter's MathML and inline SVG are rebuilt by `epubSanitize` like its HTML: one allowed element
 * at a time, with only allowed attributes whose value passes a rule. This module is those lists and
 * those rules, and nothing else — no node, no builder — so the fixed-layout slice (#771) can judge a
 * drawing with exactly the same rules.
 *
 * - **MathML is presentation only.** What draws mathematics (fractions, roots, scripts, tables,
 *   spacing) is kept with its layout attributes; Content MathML and every annotation are dropped,
 *   and so is any colour of its own (§XV: an equation takes the theme's text colour).
 * - **SVG is only what draws.** Shapes, paths, text, groups, gradients, patterns, clip paths, markers
 *   and pictures. Script, `foreignObject`, `style`, animation, filters and masks are dropped with
 *   everything inside them; a paint or a reference may only ever name something **inside the same
 *   drawing** (`url(#id)`, `#id`) — never a URL, so nothing reaches the network.
 *
 * Unknown means dropped. No regex here uses lookbehind, and each is checked against a length cap
 * before it runs, so a hostile value cannot make it slow.
 */

export const SVG_NS = "http://www.w3.org/2000/svg";
export const MATH_NS = "http://www.w3.org/1998/Math/MathML";

// ── MathML ───────────────────────────────────────────────────────────────

/** Presentation MathML kept as it is. */
export const MATH_ELEMENTS: ReadonlySet<string> = new Set([
    "math", "mrow", "mi", "mn", "mo", "ms", "mtext", "mspace", "mfrac", "msqrt", "mroot", "msub", "msup",
    "msubsup", "munder", "mover", "munderover", "mmultiscripts", "mprescripts", "none", "mtable", "mtr",
    "mtd", "mpadded", "mphantom", "mstyle", "merror", "menclose",
]);

/** The token elements: the only ones whose text is drawn. */
export const MATH_TOKENS: ReadonlySet<string> = new Set(["mi", "mn", "mo", "ms", "mtext"]);

/**
 * Dropped with everything in them. `annotation-xml` can carry XHTML or SVG, `mglyph` has a `src`.
 * Content MathML is not listed: anything not on {@link MATH_ELEMENTS} (and not plain HTML) goes too.
 */
export const MATH_DROP: ReadonlySet<string> = new Set(["annotation", "annotation-xml", "mglyph", "malignmark", "maligngroup"]);

const BOOL = /^(true|false)$/;
const MATH_LENGTH = /^\s*[+-]?(\d+\.?\d*|\.\d+)(em|ex|px|pt|%|mu|in|cm|mm|pc)?\s*$/;
const MATH_SPACE = /^-?(veryverythin|verythin|thin|medium|thick|verythick|veryverythick)mathspace$|^(small|normal|big|infinity)$/;
const MATH_LIST = /^[\w\s.%+-]{0,200}$/;

function mathLength(value: string): boolean {
    return value.length <= 40 && (MATH_LENGTH.test(value) || MATH_SPACE.test(value.trim()));
}

/** MathML attributes kept, and what a value must look like to be kept. */
const MATH_RULES: Record<string, (value: string) => boolean> = {
    display: (v) => /^(block|inline)$/.test(v),
    displaystyle: (v) => BOOL.test(v),
    scriptlevel: (v) => /^[+-]?\d{1,2}$/.test(v),
    mathvariant: (v) =>
        /^(normal|bold|italic|bold-italic|double-struck|bold-fraktur|script|bold-script|fraktur|sans-serif|bold-sans-serif|sans-serif-italic|sans-serif-bold-italic|monospace|initial|tailed|looped|stretched)$/.test(v),
    mathsize: mathLength,
    width: mathLength,
    height: mathLength,
    depth: mathLength,
    lspace: mathLength,
    rspace: mathLength,
    voffset: mathLength,
    minsize: mathLength,
    maxsize: (v) => mathLength(v) || v === "infinity",
    stretchy: (v) => BOOL.test(v),
    symmetric: (v) => BOOL.test(v),
    largeop: (v) => BOOL.test(v),
    movablelimits: (v) => BOOL.test(v),
    fence: (v) => BOOL.test(v),
    separator: (v) => BOOL.test(v),
    form: (v) => /^(prefix|infix|postfix)$/.test(v),
    accent: (v) => BOOL.test(v),
    accentunder: (v) => BOOL.test(v),
    linethickness: (v) => mathLength(v) || /^(thin|medium|thick)$/.test(v),
    bevelled: (v) => BOOL.test(v),
    notation: (v) => /^[a-z\s]{0,200}$/.test(v),
    rowalign: (v) => MATH_LIST.test(v),
    columnalign: (v) => MATH_LIST.test(v),
    rowspacing: (v) => MATH_LIST.test(v),
    columnspacing: (v) => MATH_LIST.test(v),
    rowlines: (v) => MATH_LIST.test(v),
    columnlines: (v) => MATH_LIST.test(v),
    frame: (v) => /^(none|solid|dashed)$/.test(v),
    framespacing: (v) => MATH_LIST.test(v),
    equalrows: (v) => BOOL.test(v),
    equalcolumns: (v) => BOOL.test(v),
    rowspan: (v) => /^\d{1,3}$/.test(v),
    columnspan: (v) => /^\d{1,3}$/.test(v),
    align: (v) => MATH_LIST.test(v),
    dir: (v) => /^(ltr|rtl)$/.test(v),
};

/** At most this much of an equation's alternative text is kept (FR-2). */
export const MAX_ALTTEXT = 500;

/**
 * A MathML attribute as it is kept — `[name, value]` — or `null` for one that is dropped. `href`,
 * `mathcolor`, `mathbackground`, `style`, `class`, `on*`, `xlink:*`, `src` and the rest are dropped:
 * they are not on the list. `id` is the caller's (it becomes `data-zf-id`, as in the HTML).
 */
export function mathAttribute(rawName: string, rawValue: string): [string, string] | null {
    const name = rawName.toLowerCase();
    const value = rawValue.trim();
    if (name === "alttext") return value ? ["alttext", value.slice(0, MAX_ALTTEXT)] : null;
    const rule = MATH_RULES[name];
    return rule && value.length <= 200 && rule(value) ? [name, value] : null;
}

// ── SVG ──────────────────────────────────────────────────────────────────

/** SVG kept as it is, by its canonical (case-sensitive) name. */
export const SVG_ELEMENTS: ReadonlySet<string> = new Set([
    "svg", "g", "defs", "title", "desc", "symbol", "use", "path", "rect", "circle", "ellipse", "line",
    "polyline", "polygon", "text", "tspan", "textPath", "a", "image", "linearGradient", "radialGradient",
    "stop", "pattern", "clipPath", "marker",
]);

/** SVG kept under another name. */
const SVG_RENAME: Record<string, string> = { switch: "g" };

/** The elements whose text is drawn (or read aloud): every other text node in a drawing is dropped. */
export const SVG_TEXT: ReadonlySet<string> = new Set(["text", "tspan", "textPath", "title", "desc"]);

/**
 * SVG dropped with everything in it, lower-cased. Every filter primitive (`fe*`) goes too: `feImage`
 * can fetch. Anything not on {@link SVG_ELEMENTS} is dropped all the same — this list only says
 * *these* are dropped on purpose.
 */
export const SVG_DROP: ReadonlySet<string> = new Set([
    "script", "foreignobject", "style", "animate", "animatemotion", "animatetransform", "animatecolor",
    "set", "mpath", "discard", "filter", "mask", "metadata", "view", "cursor", "font", "font-face",
    "glyph", "iframe", "video", "audio", "canvas", "handler", "listener", "prefetch",
]);

const SVG_BY_LOWER = new Map([...SVG_ELEMENTS].map((name) => [name.toLowerCase(), name] as const));

/** Whether an SVG element is dropped with everything inside it. */
export function svgDropped(rawName: string): boolean {
    const lower = rawName.toLowerCase();
    return SVG_DROP.has(lower) || lower.startsWith("fe");
}

/** The name an SVG element is kept under (its canonical case), or `null` when it is not kept. */
export function svgElementName(rawName: string): string | null {
    const lower = rawName.toLowerCase();
    if (svgDropped(lower)) return null;
    return SVG_BY_LOWER.get(lower) ?? SVG_RENAME[lower] ?? null;
}

/** What may never appear in a value an SVG engine reads as CSS: escapes, comments, scripts, at-rules. */
const HOSTILE = /\\|\/\*|expression|javascript|@|<|>/i;

const NUMBER = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;
const LENGTH = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?(px|em|ex|pt|pc|cm|mm|in|%|rem|ch|q)?\s*$/i;
/** A list of lengths (text `x`, `dx`, a dash array): numbers, units, separators — nothing else. */
const LENGTH_LIST = /^[\d\s,.eE+%a-z-]*$/i;
const OPACITY = /^\s*(\d+\.?\d*|\.\d+)%?\s*$/;
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOUR_FN = /^(rgba?|hsla?)\(\s*[\d.%\s,/+-]*\)$/i;
const COLOUR_WORD = /^[a-z]{3,24}$/i;
const LOCAL_URL = /^url\(\s*["']?#([\w.:-]{1,120})["']?\s*\)\s*(.*)$/i;

/** At most this much path data (`d`, `points`) on one element (FR-8). */
export const MAX_PATH_CHARS = 65_536;
/** At most this many `use` in one chapter: nested `use` could expand without end. */
export const MAX_USE = 256;

/** A colour literal, or a keyword that means one. Never a `url(`. */
export function colourValue(raw: string): string | null {
    const value = raw.trim();
    if (!value || value.length > 60 || HOSTILE.test(value)) return null;
    if (/^(none|currentcolor|inherit|transparent)$/i.test(value)) return value;
    if (HEX.test(value) || COLOUR_FN.test(value) || COLOUR_WORD.test(value)) return value;
    return null;
}

/** A value kept, and the id inside the drawing it points at, if any (for the caller to scope). */
export interface SvgValue {
    value: string;
    /** `url(#ref)` or `#ref`: an id that must exist inside the same `<svg>`. */
    ref?: string;
    /** For `url(#ref) fallback`: the colour to use when `ref` is not in the drawing. */
    fallback?: string;
    /** What a paint is when `ref` is not in the drawing and there is no fallback: `none`, as SVG 2 says. */
    missing?: string;
}

/**
 * A paint (`fill`, `stroke`): a colour, `none`, `currentColor`, `inherit`, or `url(#localId)` with
 * an optional fallback colour. No other `url(`, ever: a paint that names something outside the
 * drawing is `none` — what the platform paints for a reference it cannot resolve (SVG 2), so a
 * shape whose gradient lived on the web never turns into a black box hiding its label.
 */
export function paintValue(raw: string): SvgValue | null {
    const value = raw.trim();
    if (!value || value.length > 200 || HOSTILE.test(value)) return null;
    const local = LOCAL_URL.exec(value);
    if (local) {
        const fallback = local[2] ? colourValue(local[2]) : null;
        if (local[2] && !fallback) return null;
        return { value: `url(#${local[1]})`, ref: local[1], ...(fallback ? { fallback } : { missing: "none" }) };
    }
    if (/url\(/i.test(value)) return { value: "none" };
    const colour = colourValue(value);
    return colour ? { value: colour } : null;
}

/** `none`, or `url(#localId)`: what `clip-path` and the markers may name. */
function localOnly(raw: string): SvgValue | null {
    const value = raw.trim();
    if (value === "none") return { value };
    if (value.length > 200 || HOSTILE.test(value)) return null;
    const local = LOCAL_URL.exec(value);
    return local && !local[2] ? { value: `url(#${local[1]})`, ref: local[1] } : null;
}

const test = (re: RegExp, max = 100) => (v: string) => (v.length <= max && re.test(v) ? { value: v } : null);
const enumOf = (...words: string[]) => test(new RegExp(`^(${words.join("|")})$`));
const length = test(LENGTH);
const lengthList = test(LENGTH_LIST, 2000);
const number = test(NUMBER);
const opacity = test(OPACITY);

/**
 * The SVG attributes kept, by canonical name, each with the rule its value must pass. `id`, `href`
 * and `style` are not here: they are the caller's (an id is scoped, a reference resolved, a style
 * promoted through {@link promoteStyle}).
 */
export const SVG_ATTRS: Readonly<Record<string, (value: string) => SvgValue | null>> = {
    // Geometry.
    x: lengthList, y: lengthList, x1: length, y1: length, x2: length, y2: length, cx: length, cy: length,
    r: length, rx: length, ry: length, fx: length, fy: length, fr: length, width: length, height: length,
    dx: lengthList, dy: lengthList, rotate: lengthList, offset: length, pathLength: number,
    d: test(/^[MmZzLlHhVvCcSsQqTtAa0-9eE\s,.+-]*$/, MAX_PATH_CHARS),
    points: test(/^[0-9eE\s,.+-]*$/, MAX_PATH_CHARS),
    viewBox: test(/^\s*[-+\d.eE]+([\s,]+[-+\d.eE]+){3}\s*$/, 200),
    preserveAspectRatio: test(/^\s*(none|x(Min|Mid|Max)Y(Min|Mid|Max))(\s+(meet|slice))?\s*$/),
    transform: test(/^\s*((matrix|translate|scale|rotate|skewX|skewY)\s*\([-\d.eE,\s]*\)[\s,]*)*$/, 2000),
    gradientTransform: test(/^\s*((matrix|translate|scale|rotate|skewX|skewY)\s*\([-\d.eE,\s]*\)[\s,]*)*$/, 2000),
    patternTransform: test(/^\s*((matrix|translate|scale|rotate|skewX|skewY)\s*\([-\d.eE,\s]*\)[\s,]*)*$/, 2000),
    // Paint.
    fill: paintValue,
    stroke: paintValue,
    "stop-color": (v) => {
        const colour = colourValue(v);
        return colour ? { value: colour } : null;
    },
    "fill-opacity": opacity, "stroke-opacity": opacity, opacity, "stop-opacity": opacity,
    "stroke-width": length,
    "stroke-linecap": enumOf("butt", "round", "square", "inherit"),
    "stroke-linejoin": enumOf("miter", "round", "bevel", "arcs", "miter-clip", "inherit"),
    "stroke-dasharray": (v) => (v.trim() === "none" ? { value: "none" } : lengthList(v)),
    "stroke-dashoffset": length,
    "stroke-miterlimit": number,
    "fill-rule": enumOf("nonzero", "evenodd", "inherit"),
    "clip-rule": enumOf("nonzero", "evenodd", "inherit"),
    // Text.
    "font-size": (v) => length(v) ?? enumOf("xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "smaller", "larger", "inherit")(v),
    "font-weight": enumOf("normal", "bold", "bolder", "lighter", "[1-9]00", "inherit"),
    "font-style": enumOf("normal", "italic", "oblique", "inherit"),
    "font-family": test(/^[\w\s,'"-]*$/),
    "letter-spacing": (v) => (v.trim() === "normal" ? { value: "normal" } : length(v)),
    "word-spacing": (v) => (v.trim() === "normal" ? { value: "normal" } : length(v)),
    "text-anchor": enumOf("start", "middle", "end", "inherit"),
    "dominant-baseline": test(/^[a-z-]{1,30}$/),
    textLength: length,
    lengthAdjust: enumOf("spacing", "spacingAndGlyphs"),
    startOffset: length,
    // Display.
    visibility: enumOf("visible", "hidden", "collapse", "inherit"),
    display: enumOf("inline", "block", "none", "inherit", "inline-block"),
    "vector-effect": enumOf("none", "non-scaling-stroke"),
    "paint-order": test(/^[a-z\s]{1,40}$/),
    "shape-rendering": test(/^[a-zA-Z]{1,30}$/),
    "text-rendering": test(/^[a-zA-Z]{1,30}$/),
    // Gradients, patterns, clips, markers.
    gradientUnits: enumOf("userSpaceOnUse", "objectBoundingBox"),
    spreadMethod: enumOf("pad", "reflect", "repeat"),
    patternUnits: enumOf("userSpaceOnUse", "objectBoundingBox"),
    patternContentUnits: enumOf("userSpaceOnUse", "objectBoundingBox"),
    clipPathUnits: enumOf("userSpaceOnUse", "objectBoundingBox"),
    markerWidth: length,
    markerHeight: length,
    markerUnits: enumOf("strokeWidth", "userSpaceOnUse"),
    refX: (v) => length(v) ?? enumOf("left", "center", "right")(v),
    refY: (v) => length(v) ?? enumOf("top", "center", "bottom")(v),
    orient: (v) => enumOf("auto", "auto-start-reverse")(v) ?? test(/^\s*[+-]?(\d+\.?\d*|\.\d+)(deg|rad|grad|turn)?\s*$/)(v),
    "clip-path": localOnly,
    "marker-start": localOnly,
    "marker-mid": localOnly,
    "marker-end": localOnly,
    // Language and accessibility.
    lang: test(/^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/),
    dir: enumOf("ltr", "rtl"),
    role: enumOf("img"),
    "aria-label": (v) => (v.length <= 300 ? { value: v } : null),
    "aria-hidden": enumOf("true", "false"),
};

const SVG_ATTR_BY_LOWER = new Map(Object.keys(SVG_ATTRS).map((name) => [name.toLowerCase(), name] as const));

/** The canonical name an SVG attribute is kept under, or `null` when it is not on the list. */
export function svgAttributeName(rawName: string): string | null {
    return SVG_ATTR_BY_LOWER.get(rawName.toLowerCase()) ?? null;
}

/** An SVG attribute's value as it is kept, or `null` when it is dropped. */
export function svgValue(name: string, raw: string): SvgValue | null {
    const rule = SVG_ATTRS[name];
    if (!rule) return null;
    if (name !== "aria-label" && HOSTILE.test(raw)) return null;
    return rule(raw);
}

/** What a `style` attribute may say, promoted to presentation attributes. */
const PROMOTABLE: ReadonlySet<string> = new Set([
    "fill", "stroke", "fill-opacity", "stroke-opacity", "opacity", "stop-color", "stop-opacity", "stroke-width",
    "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
    "fill-rule", "clip-rule", "font-size", "font-weight", "font-style", "font-family", "letter-spacing",
    "word-spacing", "text-anchor", "dominant-baseline", "visibility", "display", "clip-path", "marker-start",
    "marker-mid", "marker-end", "paint-order", "vector-effect",
]);

/**
 * A drawing's `style` attribute, read for its colours (#770): Inkscape and Illustrator write a
 * diagram's paint there. It is **never** copied. It is split into `prop: value` pairs, and only the
 * allow-listed presentation properties whose value passes the same rule as the attribute come out,
 * to be set as presentation attributes. Everything else (`behavior`, `animation`, `position`,
 * `background: url(…)`) is gone.
 */
export function promoteStyle(style: string): Record<string, SvgValue> {
    const out: Record<string, SvgValue> = {};
    if (style.length > 4000) return out;
    for (const declaration of style.split(";")) {
        const colon = declaration.indexOf(":");
        if (colon < 0) continue;
        const prop = declaration.slice(0, colon).trim().toLowerCase();
        if (!PROMOTABLE.has(prop)) continue;
        const kept = svgValue(prop, declaration.slice(colon + 1).trim());
        if (kept) out[prop] = kept;
    }
    return out;
}

/** The id in `#id` (a reference inside the same drawing), or `null` for anything else. */
export function localRef(raw: string): string | null {
    const match = /^\s*#([\w.:-]{1,120})\s*$/.exec(raw);
    return match ? match[1] : null;
}

/**
 * A drawing's id, scoped (#770): `zf-s<draw>-<id>`, so it can never collide with the app's ids nor
 * with another drawing's — every `url(#…)` and `#…` in the same drawing is rewritten to match.
 */
export function scopedId(draw: number, id: string): string {
    return `zf-s${draw}-${id}`;
}

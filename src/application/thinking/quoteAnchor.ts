/**
 * Finding a highlighted passage again (#671, epic #667) — pure.
 *
 * A highlight never touches the note it was made in: there is no marker in the file to come back
 * to. What it keeps instead is a **text-quote anchor** — the exact words, plus a little of what came
 * before and after them — and it is found again by looking for those words in the text as it reads
 * today. The surrounding context is what tells two identical sentences apart.
 *
 * Whitespace is forgiven: a renderer that joins two lines, or a note re-wrapped since, still finds
 * the same words. Anything more (a reworded sentence) is not guessed at: the highlight is reported
 * as **detached**, and the reader lists it rather than drawing it somewhere it does not belong.
 */

/** The words you marked, and enough around them to find the same ones again. */
export interface TextQuote {
    exact: string;
    prefix: string;
    suffix: string;
}

/** Characters of context kept on each side of a quote. */
export const QUOTE_CONTEXT = 32;

/** A half-open range `[start, end)` over the text the quote was found in. */
export interface TextSpan {
    start: number;
    end: number;
}

/**
 * The quote for `[start, end)` of `text`, with its context. Leading and trailing whitespace of the
 * selection is left out of `exact` (a double-click often grabs the space after a word), and the
 * returned span says where the trimmed words are.
 */
export function quoteAt(text: string, start: number, end: number, context = QUOTE_CONTEXT): { quote: TextQuote; span: TextSpan } | null {
    let from = Math.max(0, Math.min(start, end));
    let to = Math.min(text.length, Math.max(start, end));
    while (from < to && /\s/.test(text[from])) from++;
    while (to > from && /\s/.test(text[to - 1])) to--;
    if (to <= from) return null;
    return {
        quote: {
            exact: text.slice(from, to),
            prefix: text.slice(Math.max(0, from - context), from),
            suffix: text.slice(to, Math.min(text.length, to + context)),
        },
        span: { start: from, end: to },
    };
}

/** `text` with every run of whitespace folded to one space, and where each folded char came from. */
function folded(text: string): { text: string; map: number[] } {
    let out = "";
    const map: number[] = [];
    let inSpace = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            if (inSpace) continue;
            inSpace = true;
            out += " ";
            map.push(i);
        } else {
            inSpace = false;
            out += ch;
            map.push(i);
        }
    }
    return { text: out, map };
}

/** How many characters of `want` match `have`, reading from the end of both (for a prefix). */
function matchFromEnd(have: string, want: string): number {
    let n = 0;
    while (n < have.length && n < want.length && have[have.length - 1 - n] === want[want.length - 1 - n]) n++;
    return n;
}

/** How many characters of `want` match `have`, reading from the start of both (for a suffix). */
function matchFromStart(have: string, want: string): number {
    let n = 0;
    while (n < have.length && n < want.length && have[n] === want[n]) n++;
    return n;
}

function foldSpaces(text: string): string {
    return text.replace(/\s+/g, " ");
}

/**
 * Where `quote` is in `text` today, or `null` when it cannot be found.
 *
 * Every occurrence of the exact words (whitespace-folded) is a candidate; each is scored by how much
 * of the remembered prefix and suffix still sits around it, and the best wins — the first, on a tie.
 * An empty quote never anchors.
 */
export function anchorQuote(text: string, quote: TextQuote): TextSpan | null {
    const exact = foldSpaces(quote.exact).trim();
    if (!exact) return null;
    const hay = folded(text);
    const prefix = foldSpaces(quote.prefix);
    const suffix = foldSpaces(quote.suffix);

    let best: { at: number; score: number } | null = null;
    for (let at = hay.text.indexOf(exact); at !== -1; at = hay.text.indexOf(exact, at + 1)) {
        const before = hay.text.slice(Math.max(0, at - prefix.length - 1), at);
        const after = hay.text.slice(at + exact.length, at + exact.length + suffix.length + 1);
        const score = matchFromEnd(before.trimEnd(), prefix.trimEnd()) + matchFromStart(after.trimStart(), suffix.trimStart());
        if (!best || score > best.score) best = { at, score };
    }
    if (!best) return null;
    const start = hay.map[best.at];
    const lastFolded = best.at + exact.length - 1;
    const end = hay.map[lastFolded] + 1;
    return { start, end };
}

/** Each quote anchored in `text`, or listed as detached — none is ever dropped. */
export function anchorAll<T extends { quote: TextQuote }>(text: string, items: readonly T[]): { anchored: (T & { span: TextSpan })[]; detached: T[] } {
    const anchored: (T & { span: TextSpan })[] = [];
    const detached: T[] = [];
    for (const item of items) {
        const span = anchorQuote(text, item.quote);
        if (span) anchored.push({ ...item, span });
        else detached.push(item);
    }
    return { anchored, detached };
}

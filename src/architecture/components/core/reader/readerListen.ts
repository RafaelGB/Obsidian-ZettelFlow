import { blockOf, textNodes, type NodeLike } from "./readerMarks";

/**
 * **Listen** (#765), the pure part: the chapter as sentences, the voice that reads them, and when the
 * page follows the voice. No speech here, and no DOM beyond the few members `textNodes` reads.
 *
 * Only a voice that speaks **on the device** is ever chosen (FR-2): the Web Speech API flags a voice
 * the engine sends to a server `localService: false`, and such a voice is never offered, not even as a
 * fallback. No voice left means Listen is not offered at all (FR-8).
 */

/** The speeds the listening bar offers (FR-5), from 0.75× to 2×. */
export const LISTEN_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** Where your voice and speed are kept: this device's local storage, never synced (voices differ). */
export const LISTEN_STORAGE_KEY = "zettelflow-reader-listen";

/** How long the voices are waited for before Listen is decided absent (Chrome lists them late). */
export const VOICES_PATIENCE_MS = 1000;

/** A voice, as far as Listen needs one: `SpeechSynthesisVoice`'s own fields. */
export interface VoiceLike {
    voiceURI: string;
    name: string;
    lang: string;
    localService: boolean;
    default: boolean;
}

/** Your voice (by its `voiceURI`) and your speed, as kept on this device. */
export interface ListenPrefs {
    voice?: string;
    rate: number;
}

/** A stored value, made safe: an unknown speed is 1×, a voice is a non-empty string or nothing. */
export function normalizeListenPrefs(raw: unknown): ListenPrefs {
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const rate = typeof value.rate === "number" && (LISTEN_RATES as readonly number[]).includes(value.rate) ? value.rate : 1;
    const voice = typeof value.voice === "string" && value.voice.trim() ? value.voice : undefined;
    return { rate, ...(voice ? { voice } : {}) };
}

/** A speed as the bar says it: `1.25×`. A number, never prose: no locale key. */
export function rateLabel(rate: number): string {
    return `${rate}×`;
}

/** The voices Listen may use: those that speak on the device, and only those (FR-2). */
export function localVoices<V extends VoiceLike>(voices: readonly V[]): V[] {
    return voices.filter((voice) => voice.localService === true);
}

const primary = (tag: string) => tag.toLowerCase().split(/[-_]/)[0];

/**
 * The voice that reads (AC-2): the one you chose, if it is still on the device; else one in the book's
 * language — the exact tag, then the language alone (`en-GB` for an `en` book) — preferring the
 * system's default among them; else the system's default among on-device voices; else the first one.
 * `null` when the device has no voice of its own: Listen is then not offered.
 */
export function chooseVoice<V extends VoiceLike>(voices: readonly V[], lang: string | null | undefined, remembered?: string): V | null {
    const local = localVoices(voices);
    if (local.length === 0) return null;
    if (remembered) {
        const kept = local.find((voice) => voice.voiceURI === remembered);
        if (kept) return kept;
    }
    const preferDefault = (list: V[]) => list.find((voice) => voice.default) ?? list[0];
    if (lang) {
        const exact = local.filter((voice) => voice.lang.toLowerCase().replace("_", "-") === lang.toLowerCase().replace("_", "-"));
        if (exact.length) return preferDefault(exact);
        const same = local.filter((voice) => primary(voice.lang) === primary(lang));
        if (same.length) return preferDefault(same);
    }
    return preferDefault(local);
}

/** The voices the bar's list offers: on-device ones, the book's language first, then by name. */
export function voiceChoices<V extends VoiceLike>(voices: readonly V[], lang: string | null | undefined): V[] {
    const local = localVoices(voices);
    const rank = (voice: V) => (lang && primary(voice.lang) === primary(lang) ? 0 : 1);
    return [...local].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// ── sentences ───────────────────────────────────────────────────────────────

/** A paragraph of the chapter: its text, and where it starts in `chapterText`. */
export interface ListenParagraph<E = unknown> {
    text: string;
    /** Where its text starts in the chapter's text (the highlights' offsets). */
    start: number;
    el?: E;
}

/** One sentence, the unit the voice reads: its paragraph, and its span in the chapter's text. */
export interface Sentence {
    para: number;
    start: number;
    end: number;
    text: string;
}

/**
 * Words a full stop does not end: *e.g.*, *i.e.*, *Dr.*, *p. 42*, *cf.*, *vs.* — English and Spanish
 * (*Sr.*, *pág.*), lower-cased. A lone letter (an initial, *J. R.*) and a dotted run (*e.g.*, *U.S.*)
 * are caught by shape, not listed.
 */
const ABBREVIATIONS = new Set([
    "mr", "mrs", "ms", "dr", "prof", "st", "sr", "sra", "srta", "dra", "jr", "mt", "no", "nos", "vol", "vols", "ch", "chap",
    "p", "pp", "pág", "págs", "fig", "figs", "eq", "ed", "eds", "cf", "vs", "etc", "al", "approx", "ca", "op", "cit", "ibid", "ver", "véase",
]);

/** Closing marks a sentence may end on after its full stop: quotes and brackets. */
const CLOSERS = "\"'”’»)]}";

/** Whether the full stop at `dot` closes a word that is an abbreviation, not a sentence. */
function abbreviationAt(text: string, dot: number): boolean {
    let from = dot;
    while (from > 0 && /[\p{L}.]/u.test(text[from - 1])) from--;
    const word = text.slice(from, dot);
    if (!word) return false;
    // A dotted run — e.g., i.e., U.S. — and a lone letter, an initial.
    if (word.includes(".")) return true;
    if (word.length === 1 && /\p{L}/u.test(word)) return true;
    return ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * The sentences of a paragraph's text (AC-1): split after `.`, `!`, `?` and `…` that a space and a
 * word not in lower case follow — never inside an abbreviation, an initial or a decimal (`3.5`, which
 * no space follows). Spans are offsets in `text`, trimmed of their spaces.
 */
export function sentencesOf(text: string): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = [];
    let start = 0;
    const push = (end: number) => {
        let s = start;
        let e = end;
        while (s < e && /\s/.test(text[s])) s++;
        while (e > s && /\s/.test(text[e - 1])) e--;
        if (e > s && /[\p{L}\p{N}]/u.test(text.slice(s, e))) out.push({ start: s, end: e });
        start = end;
    };
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
        let end = i + 1;
        while (end < text.length && (text[end] === "." || text[end] === "!" || text[end] === "?" || text[end] === "…")) end++;
        while (end < text.length && CLOSERS.includes(text[end])) end++;
        if (end < text.length && !/\s/.test(text[end])) continue;
        let next = end;
        while (next < text.length && /\s/.test(text[next])) next++;
        if (next >= text.length) continue; // the paragraph's own end closes it below
        // A lower-case word after it: the sentence goes on (*e.g. the case*, *p. 42, then*).
        if (/\p{Ll}/u.test(text[next])) continue;
        if (ch === "." && end === i + 1 && abbreviationAt(text, i)) continue;
        push(end);
        i = end - 1;
    }
    push(text.length);
    return out;
}

/** The sentences of a chapter's paragraphs, in order, each with its paragraph and chapter span. */
export function splitSentences(paragraphs: readonly Pick<ListenParagraph, "text" | "start">[]): Sentence[] {
    const out: Sentence[] = [];
    paragraphs.forEach((paragraph, para) => {
        for (const span of sentencesOf(paragraph.text)) {
            out.push({ para, start: paragraph.start + span.start, end: paragraph.start + span.end, text: paragraph.text.slice(span.start, span.end) });
        }
    });
    return out;
}

/**
 * The chapter's paragraphs as Listen reads them: its text nodes grouped by the block each is in (a
 * paragraph, a list item, a heading), with their offsets in `chapterText` — so a sentence is a span a
 * highlight can be kept on. A block with no words is left out.
 */
export function paragraphsOf<E extends NodeLike>(root: E): ListenParagraph<E>[] {
    const out: ListenParagraph<E>[] = [];
    let at = 0;
    let current: ListenParagraph<E> | null = null;
    for (const node of textNodes(root)) {
        const block = (blockOf(node, root) ?? root) as E;
        if (!current || current.el !== block) {
            current = { text: "", start: at, el: block };
            out.push(current);
        }
        current.text += node.data;
        at += node.data.length;
    }
    return out.filter((paragraph) => /[\p{L}\p{N}]/u.test(paragraph.text));
}

/** The sentences inside a span of the chapter (*Read aloud*, FR-3): cut to the selected words. */
export function sentencesWithin(sentences: readonly Sentence[], span: { start: number; end: number }): Sentence[] {
    const out: Sentence[] = [];
    for (const sentence of sentences) {
        const start = Math.max(sentence.start, span.start);
        const end = Math.min(sentence.end, span.end);
        if (end <= start) continue;
        const text = sentence.text.slice(start - sentence.start, end - sentence.start).trim();
        if (/[\p{L}\p{N}]/u.test(text)) out.push({ ...sentence, start, end, text });
    }
    return out;
}

/**
 * Where *From here* begins (FR-1) when the top of the page is at `offset`: the first paragraph that
 * begins on the page — never the end of one cut by the page's top edge — while it is on screen;
 * else (one long paragraph fills the page) the sentence the top line is in.
 */
export function sentenceAtTop(sentences: readonly Sentence[], paragraphs: readonly Pick<ListenParagraph, "start">[], offset: number, onScreen: (para: number) => boolean): number {
    const para = paragraphs.findIndex((paragraph) => paragraph.start >= offset);
    if (para >= 0 && onScreen(para)) {
        const first = sentences.findIndex((sentence) => sentence.para === para);
        if (first >= 0) return first;
    }
    return sentenceFrom(sentences, offset);
}

/** The first sentence that ends after `offset`: where *From here* begins. 0 when there is none. */
export function sentenceFrom(sentences: readonly Sentence[], offset: number): number {
    const found = sentences.findIndex((sentence) => sentence.end > offset);
    return found < 0 ? 0 : found;
}

// ── the page follows ────────────────────────────────────────────────────────

/** The paragraph read, and the view it is read in: screen boxes, and the stage's scroll. */
export interface FollowGeometry {
    paraTop: number;
    paraBottom: number;
    viewTop: number;
    viewHeight: number;
    scrollTop: number;
}

/** Past this share of the view, the paragraph read is near its bottom (FR-11). */
export const FOLLOW_BOTTOM = 0.85;
/** Where a move brings the paragraph: the upper third of the view. */
export const FOLLOW_LINE = 1 / 3;

/**
 * Where the stage scrolls to keep the voice in view (FR-11): `null` while the paragraph read is above
 * the bottom 15 % of the view — the page does not move per sentence — and, once it nears the bottom
 * (or is out of view above), the scroll that brings it to the upper third. `force`: *Back to the
 * voice* (FR-14) brings it there wherever it is.
 */
export function followScroll(geometry: FollowGeometry, force = false): number | null {
    const { paraTop, paraBottom, viewTop, viewHeight, scrollTop } = geometry;
    const below = paraBottom > viewTop + FOLLOW_BOTTOM * viewHeight;
    const above = paraTop < viewTop;
    // A paragraph taller than most of the view is kept by its top: nothing to gain by moving it again.
    const settled = paraTop >= viewTop && paraTop <= viewTop + viewHeight * FOLLOW_LINE + 1;
    if (!force && (!(below || above) || (below && settled))) return null;
    return Math.max(0, Math.round(scrollTop + paraTop - viewTop - viewHeight * FOLLOW_LINE));
}

/**
 * How long a sentence may go unheard before its lost `end` is given up on (an engine drops one after a
 * cancel): three times what it should take, at about fifteen characters a second, never under 4 s.
 */
export function sentenceWatchdogMs(text: string, rate: number): number {
    const expected = (text.length / 15 / Math.max(0.5, rate)) * 1000;
    return Math.max(4000, Math.round(expected * 3));
}

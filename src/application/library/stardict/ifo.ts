/**
 * **A StarDict dictionary's `.ifo`** (#766, epic #741) — pure. The small text file that says what the
 * dictionary is: its name, how many words it holds, how big its index is and how wide its offsets
 * are, and — when the build says so — the type of every entry and its languages.
 *
 * ```
 * StarDict's dict ifo file
 * version=3.0.0
 * bookname=Wiktionary (Spanish)
 * wordcount=120000
 * idxfilesize=2100000
 * idxoffsetbits=64          (3.0.0 only; 32 otherwise)
 * sametypesequence=m        (optional)
 * lang=es-en                (not in the standard; some builds carry it, or sourcelang/targetlang)
 * ```
 *
 * Every reader of the format returns a value or a reason, and never throws: a dictionary is a file
 * someone else made.
 */

/** Why a dictionary cannot be used: one line in Settings, never an error page. */
export type StardictReason = "bad-ifo" | "bad-idx" | "bad-syn" | "bad-dict" | "too-large";

export type StardictRead<T> = { ok: true; value: T } | { ok: false; reason: StardictReason };

export interface StardictIfo {
    bookname: string;
    wordcount: number;
    synwordcount?: number;
    idxfilesize: number;
    idxoffsetbits: 32 | 64;
    sametypesequence?: string;
    /** The languages the build declares, when it declares any — not part of the standard (FR-3). */
    lang?: { from: string; to?: string };
}

const MAGIC = "StarDict's dict ifo file";
/** A language tag, as the sanitiser keeps one. */
export const LANGUAGE_TAG = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;

/**
 * `lang=es-en` is a pair; `lang=es-ES` and `lang=es` are one language (a region is upper case, by
 * BCP 47's convention, and a pair's second half is a language, lower case).
 */
function declaredLanguages(fields: Map<string, string>): StardictIfo["lang"] {
    const from = fields.get("sourcelang") ?? fields.get("source_lang");
    const to = fields.get("targetlang") ?? fields.get("target_lang");
    if (from && LANGUAGE_TAG.test(from)) return { from, ...(to && LANGUAGE_TAG.test(to) ? { to } : {}) };
    const lang = fields.get("lang") ?? namedPair(fields.get("bookname"));
    if (!lang) return undefined;
    const pair = lang.match(/^([a-z]{2,3})[-_ >]+([a-z]{2,3})$/);
    if (pair) return pair[1] === pair[2] ? { from: pair[1] } : { from: pair[1], to: pair[2] };
    return LANGUAGE_TAG.test(lang) ? { from: lang } : undefined;
}

/**
 * FreeDict and the Wiktionary builds name their pair at the end of the name — *Spanish-English FreeDict
 * Dictionary (es-en)* — and declare nothing else: that suffix is their declaration (#766 walk).
 */
function namedPair(bookname: string | undefined): string | undefined {
    return bookname?.match(/\(([a-z]{2,3})-([a-z]{2,3})\)\s*$/)?.slice(1, 3).join("-");
}

export function parseIfo(text: string): StardictRead<StardictIfo> {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (lines[0]?.trim() !== MAGIC) return { ok: false, reason: "bad-ifo" };
    const fields = new Map<string, string>();
    for (const line of lines.slice(1)) {
        const at = line.indexOf("=");
        if (at <= 0) continue;
        fields.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
    }
    const count = (key: string): number | undefined => {
        const raw = fields.get(key);
        if (raw === undefined || !/^\d{1,12}$/.test(raw)) return undefined;
        return Number(raw);
    };
    const bookname = fields.get("bookname");
    const wordcount = count("wordcount");
    const idxfilesize = count("idxfilesize");
    if (!bookname || wordcount === undefined || idxfilesize === undefined) return { ok: false, reason: "bad-ifo" };
    const bits = fields.get("idxoffsetbits");
    if (bits !== undefined && bits !== "32" && bits !== "64") return { ok: false, reason: "bad-ifo" };
    const synwordcount = count("synwordcount");
    const sts = fields.get("sametypesequence");
    const lang = declaredLanguages(fields);
    return {
        ok: true,
        value: {
            bookname: bookname.slice(0, 200),
            wordcount,
            idxfilesize,
            idxoffsetbits: bits === "64" ? 64 : 32,
            ...(synwordcount !== undefined ? { synwordcount } : {}),
            ...(sts && /^[a-zA-Z]{1,16}$/.test(sts) ? { sametypesequence: sts } : {}),
            ...(lang ? { lang } : {}),
        },
    };
}

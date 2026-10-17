import { writeFileSync } from "fs";
import { makeEpub, type FixtureChapter } from "../support/zipFixture";

/**
 * A book we can measure (#825, epic #827).
 *
 * The Reader's four felt moments — open a chapter, turn a page, lay it out again, turn a chapter —
 * need a technical book to be timed on, and no real one can live in the repo. This writes one: an
 * EPUB 3 with a long chapter of prose, figures, tables, listings and footnotes, a short one a tenth
 * its size, a chapter dense with listings (which #824 reads too) and one of footnotes.
 *
 * The same two rules as `generateVault`: **deterministic** (seeded, no clock, no random) and
 * **shaped like the real thing** — a listing between paragraphs, a table now and then, a footnote
 * every few paragraphs, in fixed proportions so the long chapter is the short one ten times over.
 */

/** A small, fast, deterministic PRNG (mulberry32). Same seed, same book, on every machine. */
function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const WORDS =
    "the a of to in is that it for on as with by this be are from or an at which system module interface depth cost function value state change design complexity information hiding layer abstraction error handling exception general purpose special case comment name variable class method call return type test performance cache memory latency thread queue request response protocol network server client buffer stream parse token tree graph node edge index search sort merge".split(
        " "
    );
const KEYWORDS = ["def", "return", "if", "else", "for", "while", "class", "import", "const", "let", "function", "async", "await"];
const LANGUAGES = ["python", "javascript", "typescript", "java", "go", "rust", "bash", "sql"];

/** A unit of the long chapter: what one stretch of a technical book holds, in fixed proportions. */
const PARAGRAPHS_PER_UNIT = 6;

export interface SyntheticBook {
    /** About a megabyte of prose, figures, tables, listings and footnotes. */
    long: FixtureChapter;
    /** The same mix, a tenth of the length. */
    short: FixtureChapter;
    /** Mostly listings (#824 reads these). */
    listings: FixtureChapter;
    /** A chapter of notes and their references. */
    footnotes: FixtureChapter;
    /** The book, as the archive the Reader opens. */
    bytes: Uint8Array;
}

/** A 1×1 PNG, the figures' picture — the bytes are not what is measured. */
const PIXEL = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73,
    68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 167, 119, 128, 182, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

/** Write a book's chapters from one seed. */
export function generateBook(seed = 7): SyntheticBook {
    const next = random(seed);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
    const sentence = (min: number, spread: number): string => {
        const count = min + Math.floor(next() * spread);
        const words = Array.from({ length: count }, () => pick(WORDS));
        words[0] = words[0][0].toUpperCase() + words[0].slice(1);
        return `${words.join(" ")}.`;
    };
    const paragraph = () => `<p>${Array.from({ length: 4 + Math.floor(next() * 4) }, () => sentence(10, 14)).join(" ")}</p>`;

    const listing = (lines: number) => {
        const language = pick(LANGUAGES);
        const rows = Array.from({ length: lines }, (_, row) => {
            const indent = "    ".repeat(Math.floor(next() * 3));
            // A line now and then wider than any page, which is what a real listing has.
            const width = row % 7 === 6 ? 18 : 4 + Math.floor(next() * 6);
            const body = Array.from({ length: width }, () => (next() < 0.25 ? pick(KEYWORDS) : pick(WORDS))).join(" ");
            return `${indent}${body}`.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        });
        return `<pre data-type="programlisting" data-code-language="${language}"><code class="language-${language}">${rows.join("\n")}</code></pre>`;
    };

    const table = () => {
        const head = `<tr>${Array.from({ length: 4 }, () => `<th>${pick(WORDS)}</th>`).join("")}</tr>`;
        const rows = Array.from({ length: 6 }, () => `<tr>${Array.from({ length: 4 }, () => `<td>${pick(WORDS)} ${Math.floor(next() * 1000)}</td>`).join("")}</tr>`);
        return `<table><thead>${head}</thead><tbody>${rows.join("")}</tbody></table>`;
    };

    let figures = 0;
    const figure = () => `<figure><img src="../images/figure.png" alt="Figure ${++figures}"/><figcaption>Figure ${figures}. ${sentence(6, 8)}</figcaption></figure>`;

    let notes = 0;
    /** A paragraph with a note reference, and the note itself, as EPUB 3 writes them. */
    const noted = (): string => {
        const id = ++notes;
        return `<p>${sentence(12, 10)} <a epub:type="noteref" href="#fn${id}" id="ref${id}">${id}</a> ${sentence(10, 10)}</p><aside epub:type="footnote" id="fn${id}"><p>${sentence(8, 12)}</p></aside>`;
    };

    /** One stretch of the long and short chapters: prose, a listing, and every so often the rest. */
    const unit = (index: number): string => {
        const parts = Array.from({ length: PARAGRAPHS_PER_UNIT }, paragraph);
        parts.splice(2, 0, listing(8 + Math.floor(next() * 12)));
        if (index % 3 === 0) parts.splice(4, 0, figure());
        if (index % 4 === 1) parts.push(table());
        if (index % 2 === 0) parts.push(noted());
        return `${index % 10 === 0 ? `<h2>Section ${index / 10 + 1}</h2>` : ""}${parts.join("")}`;
    };

    const chapterOf = (units: number): string => Array.from({ length: units }, (_, index) => unit(index)).join("");
    const short = chapterOf(36);
    const long = chapterOf(360);
    const listings = Array.from({ length: 300 }, (_, index) => `${index % 5 === 0 ? paragraph() : ""}${listing(4 + Math.floor(next() * 30))}`).join("");
    const footnotes = Array.from({ length: 120 }, noted).join("");

    const chapter = (id: string, title: string, body: string): FixtureChapter => ({
        id,
        href: `text/${id}.xhtml`,
        title,
        body: `<h1>${title}</h1>${body}`,
    });
    const book = {
        long: chapter("long", "1 · A long chapter", long),
        short: chapter("short", "2 · A short chapter", short),
        listings: chapter("listings", "3 · Listings", listings),
        footnotes: chapter("footnotes", "4 · Notes", footnotes),
    };
    const bytes = makeEpub({
        title: "A technical book",
        author: "The test suite",
        language: "en",
        chapters: [book.long, book.short, book.listings, book.footnotes].map((ch) => ({
            ...ch,
            raw: `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${ch.title}</title></head><body>${ch.body}</body></html>`,
        })),
        extra: { "OEBPS/images/figure.png": PIXEL },
    });
    return { ...book, bytes };
}

/** `WRITE_BOOK=<file.epub> npx jest test/perf/generateBook` writes it for a walk by hand — only then. */
export function writeBookIfAsked(env: Record<string, string | undefined> = process.env): string | undefined {
    const target = env.WRITE_BOOK;
    if (!target) return undefined;
    writeFileSync(target, generateBook().bytes);
    return target;
}

import { describe, it, expect } from "@jest/globals";
import {
    LISTEN_RATES,
    chooseVoice,
    followScroll,
    localVoices,
    normalizeListenPrefs,
    paragraphsOf,
    rateLabel,
    sentenceAtTop,
    sentenceFrom,
    sentenceWatchdogMs,
    sentencesOf,
    sentencesWithin,
    splitSentences,
    voiceChoices,
    type VoiceLike,
} from "architecture/components/core/reader/readerListen";
import { chapterText, type NodeLike } from "architecture/components/core/reader/readerMarks";

/** Listen, the pure part (#765 AC-1, AC-2, FR-11). */

const words = (text: string, spans: { start: number; end: number }[]) => spans.map((s) => text.slice(s.start, s.end));

describe("sentences (AC-1)", () => {
    it("keeps abbreviations inside a sentence", () => {
        const text = "See p. 42, e.g. the Dr. Smith case. Then it ends.";
        expect(words(text, sentencesOf(text))).toEqual(["See p. 42, e.g. the Dr. Smith case.", "Then it ends."]);
    });

    it("keeps decimals and initials whole", () => {
        const text = "It cost 3.5 dollars. J. R. R. Tolkien wrote it. Mr. and Mrs. Bennet agreed.";
        expect(words(text, sentencesOf(text))).toEqual(["It cost 3.5 dollars.", "J. R. R. Tolkien wrote it.", "Mr. and Mrs. Bennet agreed."]);
    });

    it("ends on ! ? … and a closing quote, and keeps a sentence with no full stop", () => {
        const text = "“Is it?” she asked. Yes! It is… Then silence";
        expect(words(text, sentencesOf(text))).toEqual(["“Is it?” she asked.", "Yes!", "It is…", "Then silence"]);
    });

    it("splits Spanish the same way, ¿ and ¡ included", () => {
        const text = "Véase pág. 12 del Sr. Pérez. ¿Y luego? ¡Nada!";
        expect(words(text, sentencesOf(text))).toEqual(["Véase pág. 12 del Sr. Pérez.", "¿Y luego?", "¡Nada!"]);
    });

    it("maps each sentence to its paragraph, at its place in the chapter's text", () => {
        const paragraphs = [
            { text: "One. Two.", start: 0 },
            { text: "Three.", start: 9 },
        ];
        expect(splitSentences(paragraphs)).toEqual([
            { para: 0, start: 0, end: 4, text: "One." },
            { para: 0, start: 5, end: 9, text: "Two." },
            { para: 1, start: 9, end: 15, text: "Three." },
        ]);
    });

    it("reads a chapter's paragraphs from its blocks, with chapterText's offsets", () => {
        const text = (data: string) => ({ nodeType: 3, data, parentNode: null, splitText: () => null }) as unknown as NodeLike;
        const el = (nodeName: string, kids: NodeLike[]): NodeLike => {
            const node = { nodeType: 1, nodeName, childNodes: kids, firstChild: kids[0] ?? null, parentNode: null } as unknown as NodeLike & { parentNode: unknown };
            for (const kid of kids) (kid as { parentNode: unknown }).parentNode = node;
            return node;
        };
        const root = el("div", [el("h1", [text("Title")]), el("p", [text("First "), el("em", [text("one")]), text(". Second.")]), el("p", [text("   ")]), el("p", [text("Last.")])]);
        const paragraphs = paragraphsOf(root);
        expect(paragraphs.map((p) => [p.text, p.start])).toEqual([
            ["Title", 0],
            ["First one. Second.", 5],
            ["Last.", 26],
        ]);
        const all = chapterText(root);
        for (const s of splitSentences(paragraphs)) expect(all.slice(s.start, s.end)).toBe(s.text);
    });

    it("cuts the sentences to a selection, and finds where From here begins", () => {
        const sentences = splitSentences([{ text: "One two. Three four. Five.", start: 0 }]);
        expect(sentencesWithin(sentences, { start: 4, end: 14 }).map((s) => s.text)).toEqual(["two.", "Three"]);
        expect(sentenceFrom(sentences, 10)).toBe(1);
        expect(sentenceFrom(sentences, 999)).toBe(0);
    });

    it("begins From here at the first paragraph that begins on the page, not one cut by its top edge (FR-1)", () => {
        const paragraphs = [
            { text: "A one. A two.", start: 0 },
            { text: "B one. B two.", start: 13 },
        ];
        const sentences = splitSentences(paragraphs);
        // The top line is inside paragraph A's second sentence; B begins on the page.
        expect(sentenceAtTop(sentences, paragraphs, 8, () => true)).toBe(2);
        // B is off the page (one long paragraph fills it): the sentence the top line is in.
        expect(sentenceAtTop(sentences, paragraphs, 8, () => false)).toBe(1);
        // At a paragraph's very start: that paragraph.
        expect(sentenceAtTop(sentences, paragraphs, 0, () => true)).toBe(0);
    });
});

const voice = (over: Partial<VoiceLike>): VoiceLike => ({ voiceURI: over.name ?? "v", name: "v", lang: "en-US", localService: true, default: false, ...over });

describe("the voice (AC-2)", () => {
    const remote = voice({ name: "Cloud English", lang: "en-GB", localService: false, default: true });
    const gb = voice({ name: "Hazel", lang: "en-GB" });
    const us = voice({ name: "Zira", lang: "en-US", default: true });
    const es = voice({ name: "Helena", lang: "es-ES" });

    it("never chooses a voice that speaks off the device, even as a fallback", () => {
        expect(chooseVoice([remote], "en-GB")).toBeNull();
        expect(chooseVoice([remote, es], "en-GB")).toBe(es);
        expect(chooseVoice([remote, gb], "en-GB", remote.voiceURI)).toBe(gb);
        expect(localVoices([remote, gb, us])).toEqual([gb, us]);
        expect(voiceChoices([remote, gb, es], "es")).toEqual([es, gb]);
    });

    it("prefers the voice you chose, while the device still has it", () => {
        expect(chooseVoice([gb, us, es], "en-GB", es.voiceURI)).toBe(es);
        expect(chooseVoice([gb, us], "en-GB", "gone")).toBe(gb);
    });

    it("prefers the book's language: the exact tag, then the language alone", () => {
        expect(chooseVoice([us, gb, es], "en-GB")).toBe(gb);
        expect(chooseVoice([es, gb], "en")).toBe(gb);
        expect(chooseVoice([es, us, gb], "en")).toBe(us); // the system's default among them
        expect(chooseVoice([us, es], "es_ES")).toBe(es);
    });

    it("falls back to the system's default among the device's voices; none means null", () => {
        expect(chooseVoice([es, us], "fr")).toBe(us);
        expect(chooseVoice([es, gb], null)).toBe(es);
        expect(chooseVoice([], "en")).toBeNull();
    });

    it("keeps a speed and a voice safely, and says a speed as a number", () => {
        expect(normalizeListenPrefs(undefined)).toEqual({ rate: 1 });
        expect(normalizeListenPrefs({ rate: 3, voice: "" })).toEqual({ rate: 1 });
        expect(normalizeListenPrefs({ rate: 1.25, voice: "Hazel" })).toEqual({ rate: 1.25, voice: "Hazel" });
        expect(LISTEN_RATES).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2]);
        expect(rateLabel(1.5)).toBe("1.5×");
    });
});

describe("the page follows (FR-11)", () => {
    const view = { viewTop: 100, viewHeight: 600, scrollTop: 1000 };

    it("does not move while the paragraph read is above the bottom 15 %", () => {
        expect(followScroll({ ...view, paraTop: 400, paraBottom: 600 })).toBeNull();
        expect(followScroll({ ...view, paraTop: 500, paraBottom: 610 })).toBeNull();
    });

    it("brings it to the upper third, in one move, once it nears the bottom", () => {
        // 85 % of 600 below 100 is 610: a paragraph ending at 650 is near the bottom.
        expect(followScroll({ ...view, paraTop: 560, paraBottom: 650 })).toBe(1000 + 560 - 100 - 200);
    });

    it("brings back a paragraph that is out of view above, and any paragraph when asked", () => {
        expect(followScroll({ ...view, paraTop: -300, paraBottom: -200 })).toBe(1000 - 300 - 100 - 200);
        expect(followScroll({ ...view, paraTop: 400, paraBottom: 450 }, true)).toBe(1000 + 400 - 100 - 200);
    });

    it("leaves a tall paragraph kept by its top where it is", () => {
        expect(followScroll({ ...view, paraTop: 150, paraBottom: 1400 })).toBeNull();
    });

    it("gives a lost end three times a sentence's length, never under four seconds", () => {
        expect(sentenceWatchdogMs("short.", 1)).toBe(4000);
        expect(sentenceWatchdogMs("x".repeat(300), 1)).toBe(60000);
        expect(sentenceWatchdogMs("x".repeat(300), 2)).toBe(30000);
    });
});

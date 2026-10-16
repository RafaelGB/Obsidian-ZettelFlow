/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import { log } from "architecture";
import { HyphenationSupport, justifyDecision, probeHyphenation } from "architecture/components/core/reader/readerHyphenation";

const doc = {} as Document;

describe("justify only where words can break (#809 FR-3, FR-4, FR-7, FR-9)", () => {
    it("justifies and says the language where the runtime hyphenates it", () => {
        expect(justifyDecision(true, true, "Spanish")).toEqual({ justified: true, hint: { kind: "hyphenated", language: "Spanish" } });
    });

    it("sets the column ragged, and says why, where it cannot", () => {
        expect(justifyDecision(true, false, "Spanish")).toEqual({ justified: false, hint: { kind: "missing", language: "Spanish" } });
    });

    it("justifies as before and claims nothing when the probe could not tell", () => {
        expect(justifyDecision(true, null, "Spanish")).toEqual({ justified: true, hint: null });
    });

    it("says nothing with Justify off, whatever the runtime", () => {
        for (const answer of [true, false, null]) expect(justifyDecision(false, answer, "Spanish")).toEqual({ justified: false, hint: null });
    });
});

describe("asked once per language per session (#809 FR-2, FR-7)", () => {
    afterEach(() => HyphenationSupport.reset());

    it("probes each language once, shared by every reader", () => {
        const probe = jest.fn((_doc: Document, lang: string) => lang === "es");
        HyphenationSupport.reset(probe);
        const support = HyphenationSupport.getInstance();
        expect([support.hyphenates("es", doc), support.hyphenates("ES", doc), support.hyphenates("es", doc), support.hyphenates("en", doc)]).toEqual([true, true, true, false]);
        expect(HyphenationSupport.getInstance().hyphenates("es", doc)).toBe(true);
        expect(probe).toHaveBeenCalledTimes(2);
    });

    it("keeps an answer it could not get as unknown, said once at debug", () => {
        const debug = jest.spyOn(log, "debug").mockImplementation(() => undefined);
        HyphenationSupport.reset(() => {
            throw new Error("no layout");
        });
        const support = HyphenationSupport.getInstance();
        expect(support.hyphenates("de", doc)).toBeNull();
        expect(support.hyphenates("de", doc)).toBeNull();
        expect(debug).toHaveBeenCalledTimes(1);
        debug.mockRestore();
    });
});

describe("the real probe (#809 FR-1)", () => {
    function page(heights: { auto: number; manual: number }) {
        const body = new DomNode("body") as any;
        const made: any[] = [];
        const createDiv = body.createDiv.bind(body);
        body.createDiv = (options: any) => {
            const el = createDiv(options);
            const cls = [options.cls].flat().join(" ");
            el.offsetHeight = cls.includes("--manual") ? heights.manual : heights.auto;
            made.push(el);
            return el;
        };
        return { doc: { body } as unknown as Document, body, made };
    }

    it("a word that wraps onto more lines with hyphens: auto is a runtime that hyphenates", () => {
        expect(probeHyphenation(page({ auto: 42, manual: 21 }).doc, "es")).toBe(true);
    });

    it("the same height both ways is a runtime that does not — Obsidian on Windows", () => {
        expect(probeHyphenation(page({ auto: 21, manual: 21 }).doc, "es")).toBe(false);
    });

    it("no layout at all is no answer", () => {
        expect(probeHyphenation(page({ auto: 0, manual: 0 }).doc, "es")).toBeNull();
    });

    it("builds with classes and the language, no inline style, and takes it all away", () => {
        const { doc, body, made } = page({ auto: 21, manual: 21 });
        probeHyphenation(doc, "es");
        expect(made).toHaveLength(2);
        for (const el of made) {
            expect(el.hasClass("zettelkasten-flow__reader-hyphen-probe")).toBe(true);
            expect(el.getAttribute("lang")).toBe("es");
            expect(el.getAttribute("style")).toBeNull();
        }
        expect(made[1].hasClass("zettelkasten-flow__reader-hyphen-probe--manual")).toBe(true);
        expect(body.children).toHaveLength(0);
    });
});

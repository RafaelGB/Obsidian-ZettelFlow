import { describe, it, expect } from "@jest/globals";
import { acceptedClaim, claimDefaults, claimTitle, renderClaimNote } from "application/library/claimFromPassage";
import { mergeSourceEntries, readSourceEntry, samePlace, sourceEntry, type PassagePlace } from "application/library/provenance";
import { parseThought, renderThought, type Thought } from "application/thinking/thought";
import { ClaimSourceSchema } from "architecture/knowledge/claims";

const BOOK = "Books/How Big Things Get Done.epub";
const place: PassagePlace = {
    file: BOOK,
    chapter: "OEBPS/ch02.xhtml",
    label: "2 · Think slow, act fast",
    page: "143",
    quote: { exact: "This is the planning fallacy", prefix: "cases. ", suffix: ", or the planning" },
    title: "How Big Things Get Done",
};
const entry = sourceEntry(place);
const PASSAGE = "This is the planning fallacy,\n  or the planning bias: as some call it.";

/** The note's frontmatter, read back: every value it writes is a JSON string or a list of them. */
function frontmatterOf(content: string): Record<string, unknown> {
    const head = /^---\n([\s\S]*?)\n---\n/.exec(content)?.[1] ?? "";
    const out: Record<string, unknown> = {};
    let list: string | null = null;
    for (const line of head.split("\n")) {
        const item = /^ {2}- (.*)$/.exec(line);
        if (item && list) {
            (out[list] as unknown[]).push(JSON.parse(item[1]));
            continue;
        }
        const [, key, value] = /^([a-z]+):\s*(.*)$/.exec(line) ?? [];
        if (!key) continue;
        if (value) {
            out[key] = JSON.parse(value);
            list = null;
        } else {
            out[key] = [];
            list = key;
        }
    }
    return out;
}

describe("the claim note (#762 FR-3, AC-1)", () => {
    const content = renderClaimNote({ claim: 'Big projects fail: "complexity" is underestimated', passage: PASSAGE, entry });

    it("holds the claim as its property, JSON-quoted so a colon or a quote is safe", () => {
        expect(content.split("\n")[1]).toBe('claim: "Big projects fail: \\"complexity\\" is underestimated"');
        expect(frontmatterOf(content).claim).toBe('Big projects fail: "complexity" is underestimated');
    });

    it("holds the source as #751 writes it, one entry of the `source` list", () => {
        const front = frontmatterOf(content);
        expect(front.source).toEqual([entry]);
        expect(readSourceEntry((front.source as string[])[0])).toEqual(place);
    });

    it("quotes the passage in the body, its whitespace folded", () => {
        expect(content.endsWith("---\n\n> This is the planning fallacy, or the planning bias: as some call it.\n")).toBe(true);
    });

    it("is read by the claim parser at once: one claim, the book as a link source", () => {
        const claims = new ClaimSourceSchema().parse({
            path: "Big projects fail.md",
            frontmatter: frontmatterOf(content),
            inlineFields: [],
            resolvedTargets: { [BOOK]: BOOK },
        });
        expect(claims).toEqual([{ text: 'Big projects fail: "complexity" is underestimated', sources: [{ ref: BOOK, kind: "link" }] }]);
    });

    it("folds a claim typed over two lines into one sentence", () => {
        expect(frontmatterOf(renderClaimNote({ claim: "One\n sentence ", passage: "", entry })).claim).toBe("One sentence");
    });
});

describe("what the sheet opens with (#762 FR-2)", () => {
    it("is the selected words, and the title follows them", () => {
        expect(claimDefaults(PASSAGE)).toEqual({
            claim: "This is the planning fallacy, or the planning bias: as some call it.",
            title: "This is the planning fallacy, or the planning bias: as some call it",
        });
    });

    it("prefers an accepted *What's the claim*: its sentence, never the kind line under it", () => {
        const accepted = { text: "Plans fail because we ignore base rates.\nKind: causal" };
        expect(acceptedClaim(accepted)).toBe("Plans fail because we ignore base rates.");
        expect(claimDefaults(PASSAGE, accepted)).toEqual({ claim: "Plans fail because we ignore base rates.", title: "Plans fail because we ignore base rates" });
    });

    it("falls back to the words when the accepted thought is empty", () => {
        expect(claimDefaults("Words", { text: "  \n" }).claim).toBe("Words");
        expect(claimTitle(" A claim.. ")).toBe("A claim");
    });
});

describe("the highlight is kept, and points at its claim (#762 FR-5, AC-3)", () => {
    const highlight: Thought = {
        id: "h1",
        at: 1,
        text: "",
        links: [],
        about: BOOK,
        quote: place.quote ?? { exact: "", prefix: "", suffix: "" },
        locator: { at: 2, label: "2 · Think slow, act fast", chapter: "OEBPS/ch02.xhtml" },
    };

    it("round-trips `claims`, a path with a comma included", () => {
        const claimed: Thought = { ...highlight, claims: ["Claims/Big projects fail, often.md"] };
        const back = parseThought(renderThought(claimed), "Lab/1-h1.md");
        expect(back.claims).toEqual(["Claims/Big projects fail, often.md"]);
        expect(back.incubated).toBeUndefined();
    });

    it("leaves an older thought as it was: no `claims` field at all", () => {
        const back = parseThought(renderThought(highlight), "Lab/1-h1.md");
        expect("claims" in back).toBe(false);
        expect(renderThought(highlight)).not.toContain("claims");
    });

    it("reads a garbled `claims` line as no claims, never an error", () => {
        const garbled = renderThought(highlight).replace("  about:", "  claims: [not json\n  about:");
        expect(parseThought(garbled, "Lab/1-h1.md").claims).toBeUndefined();
    });
});

describe("the link: one more source entry, already-linked found (#762 FR-6, FR-7, AC-4)", () => {
    it("adds exactly one entry, and the same passage again adds none", () => {
        const before = ["[[Other.epub]] p. 1"];
        const next = mergeSourceEntries(before, [entry]);
        expect(next).toEqual([...before, entry]);
        expect(mergeSourceEntries(next, [entry])).toBeNull();
    });

    it("tells a source that already cites the passage", () => {
        const cited = readSourceEntry(entry);
        expect(cited && samePlace(cited, place)).toBe(true);
        const other = readSourceEntry(sourceEntry({ ...place, quote: { exact: "Another sentence", prefix: "", suffix: "" } }));
        expect(other && samePlace(other, place)).toBe(false);
    });
});

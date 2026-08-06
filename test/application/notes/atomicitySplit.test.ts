import { describe, it, expect } from "@jest/globals";
import {
    NoteSection,
    ParsedNote,
    SectionReplacement,
    buildAtomicNoteBody,
    deriveTitle,
    parseNote,
    rewriteSourceBody,
} from "application/notes/atomicitySplit";

const ILLEGAL = /[[\]#^|/\\:]/;

describe("parseNote — AC-4 content preservation", () => {
    const cases: Array<{ name: string; input: string }> = [
        {
            name: "frontmatter + preamble + multiple sections",
            input:
                "---\ntitle: T\ntags: [a]\n---\nIntro preamble.\n\n# Section one\nBody one.\n\n# Section two\nBody two.\n",
        },
        {
            name: "no frontmatter, no preamble",
            input: "# First\nAlpha.\n\n# Second\nBeta.\n",
        },
        {
            name: "sections containing sub-headings",
            input: "# Top\nintro\n## Sub A\nmore\n### Deep\nx\n\n# Second\ntail\n",
        },
        {
            name: "no headings at all (pure preamble)",
            input: "Just some prose.\nNo headings here.\n",
        },
        {
            name: "no trailing newline on last section",
            input: "# Only heading\nbody without trailing newline",
        },
        {
            name: "windows line endings",
            input: "---\r\ntitle: T\r\n---\r\npre\r\n\r\n# One\r\nx\r\n\r\n# Two\r\ny\r\n",
        },
    ];

    for (const testCase of cases) {
        it(`reassembles exactly: ${testCase.name}`, () => {
            const parsed = parseNote(testCase.input);
            const reassembled =
                parsed.frontmatter + parsed.preamble + parsed.sections.map((s) => s.body).join("");
            expect(reassembled).toBe(testCase.input);
        });
    }

    it("does not treat ## sub-headings as section boundaries", () => {
        const parsed = parseNote("# Top\nintro\n## Sub\nmore\n# Second\ntail\n");
        expect(parsed.sections).toHaveLength(2);
        expect(parsed.sections[0].heading).toBe("Top");
        expect(parsed.sections[0].body).toContain("## Sub");
        expect(parsed.sections[1].heading).toBe("Second");
    });

    it("extracts heading text and raw heading line", () => {
        const parsed = parseNote("Pre.\n\n# My topic\nbody\n");
        expect(parsed.preamble).toBe("Pre.\n\n");
        expect(parsed.sections[0].heading).toBe("My topic");
        expect(parsed.sections[0].headingLine).toBe("# My topic");
        expect(parsed.sections[0].title).toBe("My topic");
    });
});

describe("parseNote — fewer than two sections", () => {
    it("returns zero sections when there is no top-level heading", () => {
        expect(parseNote("just prose\n").sections).toHaveLength(0);
    });

    it("returns a single section for one top-level heading", () => {
        expect(parseNote("# Only\nbody\n").sections).toHaveLength(1);
    });

    it("does not count a ## heading as a top-level section", () => {
        expect(parseNote("## Not top level\nbody\n").sections).toHaveLength(0);
    });
});

describe("deriveTitle", () => {
    it("strips leading heading markers and trims", () => {
        expect(deriveTitle("#   Hello world  ")).toBe("Hello world");
    });

    it("removes characters illegal in note names", () => {
        const result = deriveTitle("a[b]c#d^e|f/g\\h:i");
        expect(ILLEGAL.test(result)).toBe(false);
        expect(result).toBe("abcdefghi");
    });

    it("collapses runs of whitespace", () => {
        expect(deriveTitle("Draft:   notes")).toBe("Draft notes");
    });
});

describe("buildAtomicNoteBody", () => {
    const section: NoteSection = {
        heading: "Topic",
        headingLine: "# Topic",
        body: "# Topic\nSome content.\n\n",
        title: "Topic",
    };

    it("contains the section body and a backlink to the source", () => {
        const body = buildAtomicNoteBody(section, "Source note");
        expect(body).toContain("# Topic");
        expect(body).toContain("Some content.");
        expect(body).toContain("[[Source note]]");
    });

    it("prefixes the backlink when a prefix is given", () => {
        const body = buildAtomicNoteBody(section, "Source", "Split from");
        expect(body).toContain("Split from [[Source]]");
    });
});

describe("rewriteSourceBody — AC-5", () => {
    const input =
        "---\ntitle: T\n---\nIntro preamble.\n\n# Section one\nBody one.\n\n# Section two\nBody two.\n";

    it("replaces every selected section with exactly one wikilink, preserving the rest", () => {
        const parsed = parseNote(input);
        const replacements: SectionReplacement[] = parsed.sections.map((section, i) => ({
            section,
            linkBasename: `Section ${i === 0 ? "one" : "two"}`,
        }));

        const rewritten = rewriteSourceBody(parsed, replacements);

        // Frontmatter and preamble survive byte-for-byte.
        expect(rewritten).toContain("---\ntitle: T\n---\n");
        expect(rewritten).toContain("Intro preamble.\n\n");
        // The original section prose is gone.
        expect(rewritten).not.toContain("Body one.");
        expect(rewritten).not.toContain("Body two.");
        // Exactly one wikilink per replaced section.
        expect(rewritten.split("[[Section one]]")).toHaveLength(2);
        expect(rewritten.split("[[Section two]]")).toHaveLength(2);
        // No dangling empty link.
        expect(rewritten).not.toContain("[[]]");
    });

    it("preserves excluded sections verbatim while replacing selected ones", () => {
        const parsed = parseNote(input);
        const replacements: SectionReplacement[] = [
            { section: parsed.sections[0], linkBasename: "Section one" },
        ];

        const rewritten = rewriteSourceBody(parsed, replacements);

        expect(rewritten).toContain("[[Section one]]");
        expect(rewritten).not.toContain("Body one.");
        // The excluded second section is untouched.
        expect(rewritten).toContain("# Section two\nBody two.\n");
    });

    it("never emits an empty wikilink for a blank basename", () => {
        const parsed = parseNote(input);
        const replacements: SectionReplacement[] = [
            { section: parsed.sections[0], linkBasename: "   " },
        ];

        const rewritten = rewriteSourceBody(parsed, replacements);

        expect(rewritten).not.toContain("[[]]");
        // A blank basename leaves the section verbatim.
        expect(rewritten).toContain("# Section one\nBody one.\n");
    });

    it("leaves everything verbatim when there are no replacements", () => {
        const parsed = parseNote(input);
        const rewritten = rewriteSourceBody(parsed, [] as SectionReplacement[]);
        const reassembled: ParsedNote = parsed;
        expect(rewritten).toBe(
            reassembled.frontmatter +
                reassembled.preamble +
                reassembled.sections.map((s) => s.body).join("")
        );
    });
});

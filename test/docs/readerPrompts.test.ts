import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { READER_AI_MOVES, TRANSLATE_TASK } from "application/thinking/readerMovePrompts";
import { DICTIONARIES_DOCS_URL } from "architecture/components/core/reader/readerLookup";

/**
 * **The prompts are public** (#759 FR-5): what each AI move asks your provider is quoted word for
 * word on the Reader's page, so the page can never say one thing while the code asks another.
 */
const PAGE = readFileSync(join(__dirname, "..", "..", "docs", "development", "reader.md"), "utf8");

describe("the Reader's AI prompts, in the open (#759 FR-5)", () => {
    it.each(READER_AI_MOVES.map((m) => [m.id, m.task]))("quotes %s's task verbatim", (_id, task) => {
        expect(PAGE).toContain(task);
    });

    it("says how the answer's language and length are asked, and what is sent", () => {
        expect(PAGE).toContain("Answer in <your Obsidian language>, in at most N sentences, with no preamble.");
        for (const field of ["Book:", "Chapter:", "Previous paragraph:", "Paragraph:", "Selected:"]) expect(PAGE).toContain(field);
    });

    it("quotes Translate's task verbatim, and says it sends the passage only (#766 FR-9)", () => {
        expect(PAGE).toContain(TRANSLATE_TASK.replace("{language}", "<the target language>"));
        expect(PAGE).toContain("Passage: <the passage you selected>");
    });
});

describe("Where to find free dictionaries is a page of the site (#766 FR-8)", () => {
    it("points at the dictionaries page, which is in the nav", () => {
        const root = join(__dirname, "..", "..");
        expect(DICTIONARIES_DOCS_URL).toBe("https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader-dictionaries/");
        expect(readFileSync(join(root, "mkdocs.yml"), "utf8")).toContain("development/reader-dictionaries.md");
        const page = readFileSync(join(root, "docs", "development", "reader-dictionaries.md"), "utf8");
        expect(page).toContain("StarDict");
    });
});

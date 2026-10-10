import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { READER_AI_MOVES } from "application/thinking/readerMovePrompts";

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
});

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveTargetPath } from "actions/knowledge/knowledgeActionCore";
import { notePersistenceForPath } from "application/notes/model/NotePersistence";
import type { ExecuteInfo } from "architecture/api";

// test/architecture/api → 3 ups → repo root
const TYPING = join(__dirname, "..", "..", "..", "src", "architecture", "api", "typing.ts");

/**
 * #275 (S6) — the action/script boundary (`ExecuteInfo.note`) must expose the note as the
 * persistence/representation view `NotePersistence`, not the wizard-shaped `NoteDTO`. Knowledge
 * domain access flows through `KnowledgeContext`, so the note the boundary hands out never needs the
 * builder's wizard-flow methods.
 */
describe("ExecuteInfo.note is the persistence/representation view (#275)", () => {
    const src = readFileSync(TYPING, "utf8");

    it("types ExecuteInfo.note as NotePersistence, not NoteDTO", () => {
        expect(src).toMatch(/note:\s*NotePersistence\b/);
        expect(src).not.toMatch(/note:\s*NoteDTO\b/);
    });

    it("resolveTargetPath needs only a NotePersistence note (falls back to its final path)", () => {
        const info = {
            element: { type: "find-related", id: "find-related", hasUI: false, key: "related", zone: "frontmatter" },
            content: undefined,
            note: notePersistenceForPath("Built/Note.md"),
            context: {},
        } as unknown as ExecuteInfo;
        const el = info.element as unknown as Parameters<typeof resolveTargetPath>[1];
        expect(resolveTargetPath(info, el)).toBe("Built/Note.md");
    });

    it("resolveTargetPath prefers a configured el.target over the note path", () => {
        const info = {
            element: { type: "find-related", id: "find-related", hasUI: false, key: "related", zone: "frontmatter", target: "Notes/Idea.md" },
            content: undefined,
            note: notePersistenceForPath("Built/Note.md"),
            context: {},
        } as unknown as ExecuteInfo;
        const el = info.element as unknown as Parameters<typeof resolveTargetPath>[1];
        expect(resolveTargetPath(info, el)).toBe("Notes/Idea.md");
    });
});

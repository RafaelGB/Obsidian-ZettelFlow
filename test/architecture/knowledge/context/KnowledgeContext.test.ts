import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import {
    createKnowledgeContext,
    KnowledgeSink,
} from "architecture/knowledge/context/KnowledgeContext";

describe("createKnowledgeContext — pure seam (#264, FR-1/FR-2/FR-7, AC-2/AC-6)", () => {
    it("builds an identity-only context from a bare path (no NoteDTO): model null, empty frontmatter", () => {
        const ctx = createKnowledgeContext({ identity: "Notes/Idea.md" });

        expect(ctx.identity).toBe("Notes/Idea.md");
        expect(ctx.model).toBeNull();
        expect(ctx.frontmatter).toEqual({});
    });

    it("defaults identity to null when none is given", () => {
        const ctx = createKnowledgeContext({});
        expect(ctx.identity).toBeNull();
    });

    it("write() is a safe no-op when no sink is injected", () => {
        const ctx = createKnowledgeContext({ identity: "X.md" });
        expect(() => ctx.write("related", ["[[N]]"], "frontmatter")).not.toThrow();
    });

    it("write() delegates to the injected sink with (key, value, zone)", () => {
        const sink = jest.fn() as jest.MockedFunction<KnowledgeSink>;
        const ctx = createKnowledgeContext({ identity: "X.md", sink });

        ctx.write("related", ["[[N]]"], "frontmatter");

        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink).toHaveBeenCalledWith("related", ["[[N]]"], "frontmatter");
    });

    it("exposes an injected frontmatter view", () => {
        const ctx = createKnowledgeContext({ identity: "X.md", frontmatter: { tags: ["a"] } });
        expect(ctx.frontmatter).toEqual({ tags: ["a"] });
    });

    it("the pure module imports no NoteDTO / KnowledgeIndex / obsidian (§XI boundary)", () => {
        const source = readFileSync(
            join(__dirname, "..", "..", "..", "..", "src", "architecture", "knowledge", "context", "KnowledgeContext.ts"),
            "utf8"
        );
        // Import lines only — the JSDoc may name these types to explain the boundary; it must not pull them.
        const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
        const imports = importLines.join("\n");
        expect(imports).not.toMatch(/NoteDTO|ContentDTO/);
        expect(imports).not.toMatch(/KnowledgeIndex/);
        expect(imports).not.toMatch(/from\s+["']obsidian["']/);
        // Must import KnowledgeModel by deep path, never the architecture/knowledge barrel.
        expect(imports).not.toMatch(/from\s+["']architecture\/knowledge["']/);
    });
});

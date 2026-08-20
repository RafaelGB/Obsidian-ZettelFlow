import { describe, it, expect } from "@jest/globals";
import { fromExecuteInfo } from "actions/knowledge/knowledgeContextAdapter";
import { writeKnowledgeResult, resolveTargetPath } from "actions/knowledge/knowledgeActionCore";
import { ContentDTO } from "application/notes/model/ContentDTO";
import type { ExecuteInfo } from "architecture/api";
import type { NoteDTO } from "application/notes/model/NoteDTO";

/** Build an ExecuteInfo with a fresh ContentDTO/context and a bare-path note stand-in. */
function makeInfo(opts: { target?: string; key: string; zone: string; notePath: string }): ExecuteInfo {
    const element = {
        type: "find-related",
        id: "find-related",
        hasUI: false,
        result: null,
        key: opts.key,
        zone: opts.zone,
        ...(opts.target !== undefined ? { target: opts.target } : {}),
    };
    const note = { getFinalPath: () => opts.notePath } as unknown as NoteDTO;
    return {
        element,
        content: new ContentDTO(),
        note,
        context: {},
    } as unknown as ExecuteInfo;
}

describe("fromExecuteInfo adapter (#264, FR-3/FR-4, AC-3/AC-4)", () => {
    describe("identity parity with resolveTargetPath (AC-4)", () => {
        it("uses the configured el.target when present", () => {
            const info = makeInfo({ target: "Notes/Idea.md", key: "related", zone: "frontmatter", notePath: "Built/Note.md" });
            const el = info.element as unknown as Parameters<typeof resolveTargetPath>[1];
            expect(fromExecuteInfo(info).identity).toBe(resolveTargetPath(info, el));
            expect(fromExecuteInfo(info).identity).toBe("Notes/Idea.md");
        });

        it("falls back to the built note's path when no target", () => {
            const info = makeInfo({ key: "related", zone: "frontmatter", notePath: "Built/Note.md" });
            const el = info.element as unknown as Parameters<typeof resolveTargetPath>[1];
            expect(fromExecuteInfo(info).identity).toBe(resolveTargetPath(info, el));
            expect(fromExecuteInfo(info).identity).toBe("Built/Note.md");
        });

        it("is null when there is neither a target nor a note path", () => {
            const info = makeInfo({ key: "related", zone: "frontmatter", notePath: "" });
            expect(fromExecuteInfo(info).identity).toBeNull();
        });
    });

    describe("sink round-trips byte-for-byte with writeKnowledgeResult (AC-3)", () => {
        const zones = ["frontmatter", "context", "body"];
        for (const zone of zones) {
            it(`matches for the "${zone}" zone`, () => {
                const value = ["[[A]]", "[[B]]"];
                // Adapter path.
                const viaAdapter = makeInfo({ key: "related", zone, notePath: "N.md" });
                const elA = viaAdapter.element as unknown as { key: string; zone: string };
                fromExecuteInfo(viaAdapter).write(elA.key, value, elA.zone);
                // Direct path.
                const viaDirect = makeInfo({ key: "related", zone, notePath: "N.md" });
                const elD = viaDirect.element as unknown as Parameters<typeof writeKnowledgeResult>[1];
                writeKnowledgeResult(viaDirect, elD, value);

                expect(viaAdapter.content.getFrontmatter()).toEqual(viaDirect.content.getFrontmatter());
                expect(viaAdapter.context).toEqual(viaDirect.context);
            });
        }

        it("a 'body' zone still reaches frontmatter (predicate is zone !== 'context')", () => {
            const info = makeInfo({ key: "related", zone: "body", notePath: "N.md" });
            fromExecuteInfo(info).write("related", ["[[A]]"], "body");
            expect(info.content.getFrontmatter()).toEqual({ related: ["[[A]]"] });
            expect(info.context).toEqual({ related: ["[[A]]"] });
        });

        it("a 'context' zone does NOT touch frontmatter", () => {
            const info = makeInfo({ key: "related", zone: "context", notePath: "N.md" });
            fromExecuteInfo(info).write("related", ["[[A]]"], "context");
            expect(info.content.getFrontmatter()).toEqual({});
            expect(info.context).toEqual({ related: ["[[A]]"] });
        });
    });
});

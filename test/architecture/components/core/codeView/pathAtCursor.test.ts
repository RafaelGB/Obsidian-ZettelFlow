import { describe, it, expect } from "@jest/globals";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { pathAtCursor } from "architecture/components/core/codeView/editor/extensions/apiCompletion/apiCompletion";

function contextFor(doc: string, pos: number = doc.length): CompletionContext {
    return new CompletionContext(EditorState.create({ doc }), pos, false);
}

/**
 * Ported from the deleted `Autocompletion.test.ts` (#351). The completion engine changed, but this
 * off-by-one is a real bug that was already fixed once: a leading delimiter made `from` point at the
 * dot, so accepting a suggestion produced `zfinternal` instead of `zf.internal`. Rewriting the engine
 * is exactly when a fixed bug comes back, so the case survives its original test.
 */
describe("the insert range covers only the word under the cursor (#351)", () => {
    it("starts at the partial word when a delimiter precedes the token", () => {
        const ctx = contextFor("const x = zf.in");
        const at = pathAtCursor(ctx);

        expect(at).not.toBeNull();
        expect(at?.from).toBe(ctx.pos - 2);
        expect(at?.segments).toEqual(["zf"]);
        expect(at?.partial).toBe("in");
    });

    it("is correct at the start of a line, with no leading delimiter", () => {
        const ctx = contextFor("zf.in");

        expect(pathAtCursor(ctx)?.from).toBe(ctx.pos - 2);
    });

    it("inserts at the cursor when the path ends in a dot", () => {
        const ctx = contextFor("zf.internal.");
        const at = pathAtCursor(ctx);

        expect(at?.from).toBe(ctx.pos);
        expect(at?.segments).toEqual(["zf", "internal"]);
        expect(at?.partial).toBe("");
    });

    it("resolves a deep path, so zf.knowledge. reaches the projections", () => {
        expect(pathAtCursor(contextFor("await zf.knowledge."))?.segments).toEqual(["zf", "knowledge"]);
    });

    it("says nothing inside a comment or an unterminated string", () => {
        expect(pathAtCursor(contextFor("// zf.in"))).toBeNull();
        expect(pathAtCursor(contextFor('const x = "zf.in'))).toBeNull();
        expect(pathAtCursor(contextFor("const x = 'zf.in"))).toBeNull();
    });

    it("says nothing for a bare word with no path to resolve", () => {
        expect(pathAtCursor(contextFor("cons"))).toBeNull();
    });
});

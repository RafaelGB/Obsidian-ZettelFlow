import { describe, it, expect } from "@jest/globals";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { customCompletionProvider } from "architecture/components/core/codeView/editor/extensions/autoconfiguration/Autocompletion";

function contextFor(doc: string, pos: number = doc.length): CompletionContext {
    const state = EditorState.create({ doc });
    return new CompletionContext(state, pos, false);
}

describe("customCompletionProvider — completion insert range", () => {
    it("replaces only the final segment when the token is preceded by a delimiter", () => {
        // Regression for the `from` off-by-one: a leading space made `from` point at the dot,
        // so accepting a completion produced e.g. `zfinternal` instead of `zf.internal`.
        const ctx = contextFor("const x = zf.in");
        const result = customCompletionProvider(ctx);
        expect(result).not.toBeNull();
        // The replaced range must start at the beginning of "in", i.e. 2 chars before the cursor.
        expect(result!.from).toBe(ctx.pos - 2);
        expect(result!.options.map((o) => o.label)).toContain("internal");
    });

    it("is also correct at the start of a line (no leading delimiter)", () => {
        const ctx = contextFor("zf.in");
        const result = customCompletionProvider(ctx);
        expect(result).not.toBeNull();
        expect(result!.from).toBe(ctx.pos - 2);
    });
});

import { describe, it, expect } from "@jest/globals";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxDiagnostics } from "architecture/components/core/codeView/editor/extensions/apiCompletion/syntaxLint";

function stateFor(code: string): EditorState {
    return EditorState.create({ doc: code, extensions: [javascript()] });
}

describe("the lint gutter finally has a source (#351, FR-4/AC-4)", () => {
    it("says nothing about valid code", () => {
        expect(syntaxDiagnostics(stateFor("content.add('hello');"))).toEqual([]);
    });

    it("says nothing about valid async code, which every surface wraps scripts in", () => {
        expect(syntaxDiagnostics(stateFor("const x = await zf.knowledge.debt();\nreturn x;"))).toEqual([]);
    });

    it("flags a syntax error", () => {
        const diagnostics = syntaxDiagnostics(stateFor("const = ;"));

        expect(diagnostics.length).toBeGreaterThan(0);
        expect(diagnostics[0].severity).toBe("error");
    });

    it("points at where the problem is, not at the start of the file", () => {
        const code = "const good = 1;\nconst = ;";
        const [first] = syntaxDiagnostics(stateFor(code));

        expect(first.from).toBeGreaterThanOrEqual(code.indexOf("\n"));
    });

    it("never points past the end of the document", () => {
        const code = "function broken( {";
        const state = stateFor(code);

        for (const diagnostic of syntaxDiagnostics(state)) {
            expect(diagnostic.to).toBeLessThanOrEqual(state.doc.length);
            expect(diagnostic.from).toBeLessThanOrEqual(diagnostic.to);
        }
    });

    it("does not paint one broken construct five times over", () => {
        const diagnostics = syntaxDiagnostics(stateFor("const = ;"));

        expect(diagnostics.length).toBeLessThanOrEqual(3);
    });

    it("carries a message, so the gutter marker explains itself", () => {
        const [first] = syntaxDiagnostics(stateFor("const = ;"));

        expect(first.message.length).toBeGreaterThan(0);
    });
});

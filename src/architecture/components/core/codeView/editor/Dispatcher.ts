import { basicSetup } from "codemirror";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewUpdate, placeholder, lineNumbers, tooltips, keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { codeFolding, bracketMatching, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { LIBRARY_SCRIPT_BINDINGS, type ScriptBinding } from "architecture/api";

import { apiCompletion, apiHover } from "./extensions/apiCompletion/apiCompletion";
import { syntaxLint } from "./extensions/apiCompletion/syntaxLint";

/**
 * Build a script editor for one scripting surface.
 *
 * `bindings` is the surface's contract from #349 — the same constant the runtime injects from and the
 * settings reader advertises. Passing it here is what lets completions and hover describe exactly what
 * *this* editor's script will receive, instead of the one-size-fits-all table each surface used to
 * carry its own copy of.
 */
export function dispatchEditor(
    parentEl: HTMLDivElement,
    code: string, onChange:
        (update: ViewUpdate) => void,
    bindings: readonly ScriptBinding[] = LIBRARY_SCRIPT_BINDINGS,
    extraExtensions: Extension[] = []
) {
    const editorView = new EditorView({
        state: EditorState.create({
            doc: code,
            extensions: [
                basicSetup,
                javascript(),
                EditorView.lineWrapping,
                apiCompletion(bindings),
                apiHover(bindings),
                codeFolding(),
                bracketMatching(),
                lineNumbers(),
                tooltips(),
                history(),
                lintGutter(),
                syntaxLint(),
                keymap.of([...defaultKeymap, ...historyKeymap, ...lintKeymap]),
                placeholder("// Enter code here..."),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                // Listener to update the 'code' variable when the editor changes
                EditorView.updateListener.of(onChange),
                // Add any extra extensions passed in
                ...extraExtensions
            ],
        }),
        parent: parentEl,
    });
    editorView.dispatch();

    return editorView;
}

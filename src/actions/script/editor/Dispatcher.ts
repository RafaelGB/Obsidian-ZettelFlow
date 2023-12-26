import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate, placeholder, lineNumbers, tooltips, keymap } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";
import { codeFolding, bracketMatching, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { lintGutter, lintKeymap } from "@codemirror/lint";

import { customAutocomplete } from "./extensions/autoconfiguration/Autocompletion";

export function dispatchEditor(
    parentEl: HTMLDivElement,
    code: string, onChange:
        (update: ViewUpdate) => void
) {
    const editorView = new EditorView({
        state: EditorState.create({
            doc: code,
            extensions: [
                basicSetup,
                EditorView.lineWrapping,
                autocompletion(),
                customAutocomplete,
                codeFolding(),
                bracketMatching(),
                lineNumbers(),
                tooltips(),
                history(),
                lintGutter(),
                keymap.of([...defaultKeymap, ...historyKeymap, ...lintKeymap]),
                placeholder("// Enter code here..."),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                // Listener to update the 'code' variable when the editor changes
                EditorView.updateListener.of(onChange),
            ],
        }),
        parent: parentEl,
    });
    editorView.dispatch();

    return editorView;
}
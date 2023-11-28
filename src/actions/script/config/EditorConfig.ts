import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate, placeholder, lineNumbers } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { autocompletion } from "@codemirror/autocomplete";
import { codeFolding, bracketMatching } from "@codemirror/language";



export function dispatchEditor(parentEl: HTMLDivElement, code: string, onChange: (update: ViewUpdate) => void) {
    new EditorView({
        state: EditorState.create({
            doc: code,
            extensions: [
                basicSetup,
                EditorView.lineWrapping,
                autocompletion(),
                codeFolding(),
                bracketMatching(),
                lineNumbers(),
                javascript(),
                placeholder("// Enter code here..."),
                // Listener to update the 'code' variable when the editor changes
                EditorView.updateListener.of(onChange),
            ],
        }),
        parent: parentEl,
    }).dispatch();
}
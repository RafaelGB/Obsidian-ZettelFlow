import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate, placeholder, lineNumbers, tooltips } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { codeFolding, bracketMatching } from "@codemirror/language";
import { customAutocomplete } from "./extensions/autoconfiguration/Autocompletion";

export function dispatchEditor(parentEl: HTMLDivElement, code: string, onChange: (update: ViewUpdate) => void) {
    new EditorView({
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
                javascript(),
                placeholder("// Enter code here..."),
                // Listener to update the 'code' variable when the editor changes
                EditorView.updateListener.of(onChange),
            ],
        }),
        parent: parentEl,
    }).dispatch();
}
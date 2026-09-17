import { EditorView } from "@codemirror/view";
import { c } from "architecture";
import { t } from "architecture/lang";
import type { ScriptBinding } from "architecture/api";

/**
 * What this surface hands your script, insertable (#449, epic #443).
 *
 * The editor already knows the surface's contract — completions and hover are built from it
 * (#349) — but only if you remember the name to start typing. A script's bindings are four or
 * five words; showing them costs a row and saves a trip to the docs.
 *
 * It inserts the name at the cursor and gives the editor focus back, because a palette that
 * steals the caret is a palette you stop using.
 */
export function renderBindingsPalette(
    parentEl: HTMLElement,
    bindings: readonly ScriptBinding[],
    view: () => EditorView | null
): void {
    if (bindings.length === 0) return;

    const palette = parentEl.createDiv({ cls: c("bindings-palette") });
    palette.createSpan({ cls: c("bindings-palette-label"), text: t("bindings_palette") });

    for (const binding of bindings) {
        const button = palette.createEl("button", {
            cls: c("bindings-palette-item"),
            text: binding.name,
            attr: { type: "button", title: `${binding.name}: ${binding.type}` },
        });
        button.addEventListener("click", () => {
            const editor = view();
            if (!editor) return;
            const at = editor.state.selection.main.head;
            editor.dispatch({
                changes: { from: at, insert: binding.name },
                selection: { anchor: at + binding.name.length },
            });
            editor.focus();
        });
    }
}

import type { EditorView } from "@codemirror/view";
import { c } from "architecture";
import { t } from "architecture/lang";
import type { ScriptExample } from "architecture/api";

type LocaleKey = Parameters<typeof t>[0];

/**
 * A clickable list of ready-to-insert examples (#351).
 *
 * The Script action and the Dynamic Selector shipped an empty editor and a **Run** button, so you had
 * to already know the API to write the first line. The condition editor solved this long ago with
 * exactly this affordance — reusing it rather than inventing a second one.
 */
export function renderExamplesList(
    parentEl: HTMLElement,
    examples: readonly ScriptExample[],
    view: () => EditorView | null
): void {
    if (examples.length === 0) return;

    const details = parentEl.createEl("details", { cls: c("script-examples") });
    details.createEl("summary", { text: t("script_examples_heading") });
    const list = details.createEl("ul", { cls: c("script-examples-list") });

    for (const example of examples) {
        const item = list.createEl("li");
        item.createSpan({ cls: c("script-example-label"), text: t(example.labelKey as LocaleKey) });
        const insert = item.createEl("button", {
            text: t("script_examples_insert"),
            cls: c("script-example-insert"),
        });
        insert.addEventListener("click", () => {
            const editor = view();
            if (!editor) return;
            // Append rather than replace: an example is a starting point, not a reset button.
            const doc = editor.state.doc;
            const prefix = doc.length > 0 ? "\n\n" : "";
            editor.dispatch({ changes: { from: doc.length, insert: `${prefix}${example.code}` } });
        });
    }
}

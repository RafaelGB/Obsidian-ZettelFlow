import ZettelFlow from "main"

import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

export function loadTextProcessors(plugin: ZettelFlow): void {

    plugin.registerMarkdownPostProcessor((element, context) => {
        const file = plugin.app.workspace.getActiveFile();
        if (file) {
            const metadata = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
            if (metadata) {
                element.querySelectorAll("p").forEach((p) => {
                    p.innerHTML = p.innerHTML.replace(/{{(.*?)}}/g, (_, key) => {
                        return metadata[key.trim()] || `{{${key}}}`;
                    });
                });
            }
        }
    });

    // Extensión para el modo Live Preview
    const extension = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.updateDecorations(view);
            }

            updateDecorations(view: EditorView): DecorationSet {
                const builder = new RangeSetBuilder<Decoration>();
                const file = plugin.app.workspace.getActiveFile();
                if (!file) return Decoration.none;

                const metadata = plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};

                for (let { from, to } of view.visibleRanges) {
                    const text = view.state.doc.sliceString(from, to);
                    const regex = /{{(.*?)}}/g;
                    let match;

                    while ((match = regex.exec(text)) !== null) {
                        const start = from + match.index;
                        const end = start + match[0].length;

                        const key = match[1].trim();

                        if (!metadata[key]) continue;
                        const replacement = metadata[key] || `{{${key}}}`;

                        builder.add(
                            start,
                            end,
                            Decoration.replace({ widget: new SelectableTextWidget(replacement, `{{${key}}}`) })
                        );
                    }
                }

                return builder.finish();
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.updateDecorations(update.view);
                }
            }
        },
        {
            decorations: v => v.decorations
        }
    );

    plugin.registerEditorExtension(extension);
}

// Widget para renderizar el texto
class SelectableTextWidget extends WidgetType {
    constructor(
        private value: string,
        private original: string
    ) {
        super();
    }

    toDOM() {
        const span = document.createElement("span");
        span.textContent = this.value;
        span.style.color = "var(--text-accent-color)";
        span.style.textDecoration = "underline";

        // Event to do editable the text when the cursor is over or click
        span.addEventListener("click", () => {

            span.contentEditable = "true";
            span.focus();
        });

        return span;
    }

}


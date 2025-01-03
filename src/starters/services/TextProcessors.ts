import ZettelFlow from "main";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

export function loadTextProcessors(plugin: ZettelFlow): void {
    const regex = /{{(.*?)}}/g;
    plugin.registerMarkdownPostProcessor((element, context) => {
        const file = plugin.app.workspace.getActiveFile();
        if (file) {
            const metadata = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
            if (metadata) {
                element.querySelectorAll("p").forEach((p) => {
                    p.innerHTML = p.innerHTML.replace(regex, (_, key) => {
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

                // Obtaining the metadata of the active file
                const metadata = plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
                const selectionRanges = view.state.selection.ranges;

                for (let { from, to } of view.visibleRanges) {
                    const text = view.state.doc.sliceString(from, to);
                    let match;

                    while ((match = regex.exec(text)) !== null) {
                        const start = from + match.index;
                        const end = start + match[0].length;

                        const key = match[1].trim();

                        // Check if the match overlaps with the selection
                        const isInSelection = selectionRanges.some(range =>
                            (start < range.to && end > range.from)
                        );

                        // Check if the match is on the current line
                        const line = view.state.doc.lineAt(start);
                        const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);
                        const isOnCurrentLine = line.number === cursorLine.number;

                        if (isInSelection || isOnCurrentLine || !metadata[key]) continue;

                        const replacement = metadata[key] || `{{${key}}}`;
                        builder.add(
                            start,
                            end,
                            Decoration.replace({ widget: new SelectableTextWidget(replacement) })
                        );
                    }
                }

                return builder.finish();
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged || update.selectionSet) {
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
    ) {
        super();
    }

    toDOM() {
        const span = document.createElement("span");
        span.textContent = this.value;
        span.style.color = "var(--text-accent-color)";
        span.style.textDecoration = "underline";

        return span;
    }
}

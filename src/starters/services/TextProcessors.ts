import ZettelFlow from "main";
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

/**
 * Loads text processors to replace placeholders of the form {{key}} 
 * with corresponding frontmatter metadata. This includes both 
 * the markdown post-processor and the live preview extension.
 * 
 * @param plugin The ZettelFlow plugin instance.
 */
export function loadTextProcessors(plugin: ZettelFlow): void {
    const placeholderRegex = /{{(.*?)}}/g;

    /**
     * Markdown Post-Processor:
     * Replaces all placeholders in the rendered HTML with the corresponding 
     * frontmatter values for the active file.
     */
    plugin.registerMarkdownPostProcessor((element, _context) => {
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return;

        const metadata = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!metadata) return;

        element.querySelectorAll("p").forEach((paragraph) => {
            paragraph.innerHTML = paragraph.innerHTML.replace(
                placeholderRegex,
                (_match, key) => metadata[key.trim()] ?? `{{${key}}}`
            );
        });
    });

    /**
     * Live Preview Extension:
     * Uses a ViewPlugin to replace placeholders with underlined text 
     * if they are not selected or on the current editing line.
     */
    const extension = ViewPlugin.fromClass(
        class {
            public decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.updateDecorations(view);
            }

            /**
             * Gathers decoration ranges for all found placeholders that can be replaced.
             * 
             * @param view The current EditorView.
             * @returns A DecorationSet containing all relevant replacements.
             */
            private updateDecorations(view: EditorView): DecorationSet {
                const builder = new RangeSetBuilder<Decoration>();
                const file = plugin.app.workspace.getActiveFile();

                if (!file) {
                    return Decoration.none;
                }

                const metadata = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
                if (Object.keys(metadata).length === 0) {
                    return Decoration.none;
                }

                const { ranges: selectionRanges } = view.state.selection;

                // Process only visible ranges to optimize performance
                for (const { from, to } of view.visibleRanges) {
                    const text = view.state.doc.sliceString(from, to);

                    // Reset regex index before each search
                    placeholderRegex.lastIndex = 0;
                    let match: RegExpExecArray | null;

                    while ((match = placeholderRegex.exec(text)) !== null) {
                        const start = from + match.index;
                        const end = start + match[0].length;
                        const key = match[1].trim();

                        // Check if placeholder is in the user's selection
                        const isInSelection = selectionRanges.some(
                            (range) => start < range.to && end > range.from
                        );

                        // Check if placeholder is on the user's current editing line
                        const line = view.state.doc.lineAt(start);
                        const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);
                        const isOnCurrentLine = line.number === cursorLine.number;

                        // If in selection, current line, or no corresponding metadata, skip
                        if (isInSelection || isOnCurrentLine || !metadata[key]) {
                            continue;
                        }

                        const replacement = metadata[key] ?? `{{${key}}}`;
                        builder.add(
                            start,
                            end,
                            Decoration.replace({ widget: new SelectableTextWidget(replacement) })
                        );
                    }
                }

                return builder.finish();
            }

            /**
             * Trigger decoration updates on certain events:
             *  - Document change
             *  - Viewport change
             *  - Selection change
             * 
             * @param update A ViewUpdate containing the changed state.
             */
            public update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged || update.selectionSet) {
                    this.decorations = this.updateDecorations(update.view);
                }
            }
        },
        {
            decorations: (v) => v.decorations,
        }
    );

    plugin.registerEditorExtension(extension);
}

/**
 * A widget class used to render placeholders as underlined, accent-colored text.
 */
class SelectableTextWidget extends WidgetType {
    constructor(private readonly value: string) {
        super();
    }

    /**
     * Creates a DOM element (a span) to display the metadata replacement text.
     * 
     * @returns A span element with styling.
     */
    public toDOM(): HTMLElement {
        const span = document.createElement("span");
        span.textContent = this.value;
        span.style.color = "var(--text-accent-color)";
        span.style.textDecoration = "underline";
        return span;
    }
}

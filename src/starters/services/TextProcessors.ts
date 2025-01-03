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
import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";

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
    plugin.registerEditorSuggest(new VariableSuggester(plugin.app));
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

class VariableSuggester extends EditorSuggest<string> {
    constructor(app: App) {
        super(app);
    }

    /**
     * Called when the user selects an option from the suggestion list
     * (by click or Enter).
     */
    selectSuggestion(variable: string, evt: MouseEvent | KeyboardEvent): void {
        this.insertVariable(variable);
    }

    /**
     * Fetches the suggestions based on the current context query.
     * Uses Obsidian's built-in metadata cache without additional caching here.
     */
    getSuggestions(context: EditorSuggestContext): string[] {
        const file = this.app.workspace.getActiveFile();
        if (!file) return [];

        // Directly retrieve frontmatter from Obsidian
        const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!metadata) return [];

        const lowerQuery = context.query.toLowerCase();
        return Object.keys(metadata).filter((key) =>
            key.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Renders each suggestion in the dropdown.
     */
    renderSuggestion(variable: string, el: HTMLElement): void {
        el.createEl("div", { text: variable });
    }

    /**
     * Determines whether to trigger the suggester based on `{{...`.
     */
    onTrigger(
        cursor: EditorPosition,
        editor: Editor,
        file: TFile
    ): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        // Get everything before the current cursor
        const sub = line.substring(0, cursor.ch);

        // Look for `{{` that hasn't been closed yet
        // match[1] captures everything after `{{` and before any `}}`
        const match = sub.match(/\{\{([^\}]*)$/);
        if (!match) return null;

        const startOfBraces = sub.lastIndexOf("{{");
        if (startOfBraces === -1) return null;

        // We'll look for a closing `}}` after the cursor, if it exists
        let nextClose = line.indexOf("}}", cursor.ch);
        // If there's no closing braces or it's before cursor, just use cursor
        if (nextClose === -1 || nextClose < cursor.ch) {
            nextClose = cursor.ch;
        }

        // The entire range includes everything from the `{{` up to `}}` (if found),
        // or just the cursor if there's no `}}`.
        return {
            start: { line: cursor.line, ch: startOfBraces },
            end: { line: cursor.line, ch: nextClose + 2 > line.length ? cursor.ch : nextClose + 2 },
            query: match[1], // The partially typed text after `{{`
        };
    }

    /**
     * Inserts the chosen variable into the editor, making sure
     * to replace the full `{{ ... }}` range with `{{variable}}`.
     */
    private insertVariable(variable: string): void {
        if (!this.context) return;
        const editor = this.context.editor;
        if (!editor) return;

        const startPos = this.context.start;
        const endPos = this.context.end;

        // Replace everything in the range from `{{` (startPos)
        // to `}}` (endPos) with `{{variable}}`
        editor.replaceRange(`{{${variable}}}`, startPos, endPos);

        // Optionally place the cursor after the inserted variable
        const afterInsert = {
            line: startPos.line,
            ch: startPos.ch + 2 + variable.length, // `{{` + variable
        };
        editor.setCursor(afterInsert);
    }
}

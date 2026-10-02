/**
 * `row.` completion for the computed-fields editor (#632). The generic API completion knows `zf`'s
 * members by probing it; `row`'s members are this Base's fields, which only the dashboard knows — so
 * it supplies them here, with each field's type and how many notes actually carry it (most fields are
 * optional, and that is the thing you need to know while writing `row.x / 8`).
 *
 * Lazily imported with the editor, so CodeMirror never enters the view's module graph.
 */
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import type { Extension } from "@codemirror/state";
import { pathAtCursor } from "architecture/components/core/codeView/editor/extensions/apiCompletion/apiCompletion";

export interface RowFieldHint {
    key: string;
    type: string;
    /** e.g. "in 5 of 6 notes". */
    coverage: string;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function rowFieldCompletion(fields: readonly RowFieldHint[]): Extension {
    const options = fields
        .filter((field) => IDENTIFIER.test(field.key))
        .map((field) => ({ label: field.key, type: "property", detail: field.type, info: field.coverage, boost: 99 }));
    return javascriptLanguage.data.of({
        autocomplete: (context: CompletionContext): CompletionResult | null => {
            const at = pathAtCursor(context);
            if (!at || at.segments.length !== 1 || at.segments[0] !== "row") return null;
            const partial = at.partial.toLowerCase();
            const matching = partial ? options.filter((o) => o.label.toLowerCase().startsWith(partial)) : options;
            return matching.length > 0 ? { from: at.from, options: matching, validFor: /^\w*$/ } : null;
        },
    });
}

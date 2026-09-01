import { linter, type Diagnostic } from "@codemirror/lint";
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { t } from "architecture/lang";

/**
 * A real source for the lint gutter (#351), which shipped installed but empty — there was a
 * `TODO: linter button action` where this belongs.
 *
 * It reports the parse errors the JavaScript grammar already found while highlighting, so a typo is
 * flagged where you typed it instead of surfacing as a notice halfway through a workflow. No new
 * dependency and no second parser: the tree is the one the editor built anyway.
 *
 * Deliberately syntax only. Type checking would need the whole TypeScript service in a bundle that is
 * already 2.4 MB, and it would have to guess at the `zf`/`app` types it has no declarations for.
 */

/** Collapse adjacent error nodes: one broken construct should not paint five markers. */
const MIN_GAP = 1;

/** The syntax errors in a document, as CodeMirror diagnostics. Pure over the editor state. */
export function syntaxDiagnostics(state: EditorState): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    let lastEnd = -MIN_GAP - 1;

    syntaxTree(state).iterate({
        enter: (node) => {
            if (!node.type.isError) return;
            const from = node.from;
            // A zero-width error node marks the position where something is missing.
            const to = Math.max(node.to, node.from + 1);
            if (from - lastEnd <= MIN_GAP) return;
            lastEnd = to;
            diagnostics.push({
                from,
                to: Math.min(to, state.doc.length),
                severity: "error",
                message: t("script_lint_syntax_error"),
            });
        },
    });

    return diagnostics;
}

/** The lint source to install alongside the gutter. */
export function syntaxLint(): Extension {
    return linter((view) => syntaxDiagnostics(view.state));
}

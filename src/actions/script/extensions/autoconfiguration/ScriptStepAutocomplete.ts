import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";

import { Completion, CompletionTree } from "architecture/components/core";
import { noteCompletions } from "./config/NoteFns";
import { contentCompletions } from "./config/ContentFns";
import { c } from "architecture";
import { findCompletions as findCompletionsInTree, KeyCompletionDefaults } from "architecture/components/core/codeView/editor/extensions/autoconfiguration/completionTree";

// Define the structure of the event object
const scriptActionTree: CompletionTree = {
    note: noteCompletions,
    content: contentCompletions,
    context: {
        label: "context",
        type: "object",
        info: "Empty object to communicate information between script actions",
        detail: "✨ ZettelFlow Script Action",
        boost: 1
    }
}

const SCRIPT_DEFAULTS: KeyCompletionDefaults = { info: "ZF API", detail: "✨ ZettelFlow Script Action" };

function findCompletions(
    segments: string[],
    node: Record<string, unknown> | Completion[]
): Completion[] | null {
    return findCompletionsInTree(segments, node, SCRIPT_DEFAULTS);
}

function customCompletionProvider(context: CompletionContext): CompletionResult | null {
    // Get line content before cursor to check context
    const line = context.state.doc.lineAt(context.pos);
    const lineText = line.text.slice(0, context.pos - line.from);

    // Check if we're in a comment or string where our completions aren't relevant
    if (/\/\/.*$/.test(lineText) ||
        (lineText.match(/"/g)?.length ?? 0) % 2 === 1 ||
        (lineText.match(/'/g)?.length ?? 0) % 2 === 1) {
        return null;
    }

    // Check for dot triggering (property access)
    const dotMatch = lineText.match(/(\w+(?:\.\w+)*)\.$/);
    if (dotMatch) {
        const segments = dotMatch[1].split('.').filter(Boolean);
        if (segments.length > 0) {
            // Check if first segment is one of our custom objects
            const rootSegment = segments[0];
            const rootCompletion = Object.keys(scriptActionTree).find(c => c === rootSegment);

            if (rootCompletion) {
                const completions = findCompletions(segments, scriptActionTree);
                if (completions && completions.length > 0) {
                    // Enhance all completions with ZettelFlow styling
                    const enhancedCompletions = completions.map(c => ({
                        ...c,
                        detail: c.detail || '✨ ZettelFlow Script Action',
                        info: c.info || 'ZF API',
                        boost: c.boost || 99, // Prioritize over standard completions
                        render: c.render || createZettelFlowRenderer(c)
                    }));

                    return {
                        from: context.pos,
                        options: enhancedCompletions,
                        validFor: /^[\w.]*$/
                    };
                }
            }
        }
        return null;
    }

    // Regular word completion (not after a dot)
    const word = context.matchBefore(/(?:^|[\s([{;])(\w+(?:\.\w+)*)$/);
    if (!word || word.text.length === 0) return null;

    // Only get the actual text without whitespace
    const actualText = word.text.trim();
    if (actualText.length === 0) return null;

    // Split the word by dots
    const segments = actualText.split('.').filter(Boolean);

    if (segments.length === 0) {
        return null;
    }

    // Find the completions for the current segments
    const completionSegments = [...segments];
    const lastSegment = completionSegments.pop() || '';
    const completions = findCompletions(completionSegments, scriptActionTree);
    if (!completions || completions.length === 0) return null;

    // Filter the completions by the last segment
    const filtered = completions.filter(c => c.label.toLowerCase().startsWith(lastSegment.toLowerCase()));

    if (filtered.length === 0) return null;

    // Enhance all completions with ZettelFlow styling
    const enhancedCompletions = filtered.map(c => ({
        ...c,
        detail: c.detail || '✨ ZettelFlow Script Action',
        info: c.info || 'ZF API',
        boost: c.boost || 99, // Prioritize over standard completions
        render: c.render || createZettelFlowRenderer(c)
    }));

    return {
        // Replace only the final segment under the cursor (see Autocompletion.ts): deriving `from`
        // from the cursor avoids eating a leading delimiter captured by the match.
        from: context.pos - lastSegment.length,
        options: enhancedCompletions,
        validFor: /^[\w.]*$/
    };
}

/**
 * Creates a custom renderer for ZettelFlow completions
 */
function createZettelFlowRenderer(completion: Completion): (element: HTMLElement) => void {
    return (element: HTMLElement) => {
        // Add a CSS class for styling
        element.classList.add(c('cm-completion'));

        // Rebuild the completion item using Obsidian's DOM helpers
        element.empty();
        const container = element.createDiv({ cls: c('cm-completion-container') });
        container.createSpan({ cls: c('cm-completion-badge'), text: '✨' });
        container.createSpan({ cls: c('cm-completion-label'), text: completion.label });
        container.createSpan({ cls: c('cm-completion-type'), text: completion.type || 'property' });
    };
}

export const scriptActionAutocomplete = javascriptLanguage.data.of({
    autocomplete: customCompletionProvider
});
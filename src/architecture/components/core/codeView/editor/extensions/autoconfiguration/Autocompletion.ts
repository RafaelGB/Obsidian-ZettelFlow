import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { coreCompletions } from "./config/CoreObjs";
import { appCompletions } from "./config/AppFns";
import { Completion } from "./typing";
import { integrationsCompletions, internalUserCompletions, internalVaultCompletions, zfCompletions } from "./config/ZettelFlowFns";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { c } from "architecture";
import { findCompletions as findCompletionsInTree, KeyCompletionDefaults } from "./completionTree";

const completionsTree = {
    app: appCompletions,
    zf: {
        ...zfCompletions,
        internal: {
            vault: internalVaultCompletions,
            user: internalUserCompletions
        },
        external: integrationsCompletions
    }
};

const CODEVIEW_DEFAULTS: KeyCompletionDefaults = { info: "ZF API", detail: "✨ ZettelFlow" };

function findCompletions(
    segments: string[],
    node: Record<string, unknown> | Completion[]
): Completion[] | null {
    return findCompletionsInTree(segments, node, CODEVIEW_DEFAULTS);
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
            const rootCompletion = coreCompletions.find(c => c.label === rootSegment);

            if (rootCompletion) {
                const completions = findCompletions(segments, completionsTree);
                if (completions && completions.length > 0) {
                    // Enhance all completions with ZettelFlow styling
                    const enhancedCompletions = completions.map(c => ({
                        ...c,
                        detail: c.detail || '✨ ZettelFlow',
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

    // If first segment is not a core object, return null to allow default JS completion
    const rootSegment = segments[0];
    const rootCompletion = coreCompletions.find(c => c.label === rootSegment);
    if (!rootCompletion) {
        return null; // Let default JS completion handle this
    }

    // Find the completions for the current segments
    const completionSegments = [...segments];
    const lastSegment = completionSegments.pop() || '';
    const completions = findCompletions(completionSegments, completionsTree);
    if (!completions || completions.length === 0) return null;

    // Filter the completions by the last segment
    const filtered = completions.filter(c => c.label.toLowerCase().startsWith(lastSegment.toLowerCase()));

    if (filtered.length === 0) return null;

    // Enhance all completions with ZettelFlow styling
    const enhancedCompletions = filtered.map(c => ({
        ...c,
        detail: c.detail || '✨ ZettelFlow',
        info: c.info || 'ZF API',
        boost: c.boost || 99, // Prioritize over standard completions
        render: c.render || createZettelFlowRenderer(c)
    }));

    return {
        from: word.from + actualText.lastIndexOf(lastSegment),
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

export const customAutocomplete = javascriptLanguage.data.of({
    autocomplete: customCompletionProvider
});


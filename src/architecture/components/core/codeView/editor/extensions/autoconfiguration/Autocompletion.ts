import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { coreCompletions } from "./config/CoreObjs";
import { contentCompletions } from "./config/ContentFns";
import { noteCompletions } from "./config/NoteFns";
import { appCompletions } from "./config/AppFns";
import { Completion } from "./typing";
import { integrationsCompletions, internalVaultCompletions, zfCompletions } from "./config/ZettelFlowFns";

const completionsTree = {
    note: noteCompletions,
    content: contentCompletions,
    app: appCompletions,
    zf: {
        ...zfCompletions,
        internal: {
            vault: internalVaultCompletions
        },
        external: integrationsCompletions
    }
};

/**
 * Verify if the node is an array of Completion objects
 */
function isCompletionArray(node: unknown): node is Completion[] {
    return Array.isArray(node);
}

function findCompletions(
    segments: string[],
    node: Record<string, unknown> | Completion[]
): Completion[] | null {
    // If the node is an array of completions, return it
    if (isCompletionArray(node)) return node;

    // If there are no segments, return the keys of the current node
    if (segments.length === 0) {
        return Object.keys(node).map(key => ({
            label: key,
            type: 'object',
            info: ''
        }));
    }

    // Get the next segment without removing it
    const nextSegment = segments[0];

    // Continue recursively with the next node if it exists
    const nextNode = (node as Record<string, unknown>)[nextSegment] as Record<string, unknown> | undefined;
    if (!nextNode) {
        // If the segment does not match any key, return the current keys
        return Object.keys(node).map(key => ({
            label: key,
            type: 'object',
            info: ''
        }));
    }

    // Move to the next segment
    return findCompletions(segments.slice(1), nextNode);
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
                    return {
                        from: context.pos,
                        options: completions,
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

    return {
        from: word.from + actualText.lastIndexOf(lastSegment),
        options: filtered,
        validFor: /^[\w.]*$/
    };
}

// Use the custom provider without overriding the default ones
export const customAutocomplete = autocompletion({
    // Add our custom completion provider in addition to the defaults
    override: [customCompletionProvider],
    activateOnTyping: true,
    maxRenderedOptions: 10,
    defaultKeymap: true,
    optionClass: option => option.type === 'method' ? 'cm-method' : option.type === 'object' ? 'cm-object' : '',
});


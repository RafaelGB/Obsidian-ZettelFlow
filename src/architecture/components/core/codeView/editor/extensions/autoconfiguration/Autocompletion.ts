import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { coreCompletions } from "./config/CoreObjs";
import { contentCompletions } from "./config/ContentFns";
import { noteCompletions } from "./config/NoteFns";
import { appCompletions } from "./config/AppFns";
import { Completion } from "./typing";
import { integrationsCompletions, internalVaultCompletions } from "./config/ZettelFlowFns";

const completionsTree = {
    note: noteCompletions,
    content: contentCompletions,
    app: appCompletions,
    zf: {
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

    // Obtain the next segment and remove it from the array
    const nextSegment = segments.shift();
    if (!nextSegment) {
        // If the segment does not match any key, return the current keys
        return Object.keys(node).map(key => ({
            label: key,
            type: 'object',
            info: ''
        }));
    }

    // Continue recursively with the remaining segments
    const nextNode = (node as Record<string, unknown>)[nextSegment] as Record<string, unknown> | undefined;
    if (!nextNode) {
        // If the segment does not match any key, return the current keys
        return Object.keys(node).map(key => ({
            label: key,
            type: 'object',
            info: ''
        }));
    }

    // Continuamos recursivamente con los segmentos restantes
    return findCompletions(segments, nextNode);
}

function customCompletionProvider(context: CompletionContext): CompletionResult | null {
    // Obtains the word before the cursor
    const word = context.matchBefore(/(\w+\.)*\w*$/);
    if (!word) return null;

    // Split the word by dots
    const segments = word.text.split('.').filter(Boolean);


    if (segments.length === 0) {
        // If there are no segments, show the core completions
        return {
            from: word.from,
            options: coreCompletions
        };
    }

    // If the first segment is not in coreCompletions, do not show suggestions
    const rootSegment = segments[0];
    const rootCompletion = coreCompletions.find(c => c.label === rootSegment);

    if (!rootCompletion) {
        // If the first segment is not in coreCompletions, do not show suggestions
        return null;
    }

    // If the word ends with a dot, show the completions for the current segment
    if (word.text.endsWith('.')) {
        const completions = findCompletions(segments, completionsTree);
        if (!completions) return null;

        return {
            from: word.to,
            options: completions
        };
    }

    // Find the completions for the current segment
    const completions = findCompletions(segments, completionsTree);
    if (!completions) return null;

    // Filter the completions by the last segment
    const lastSegment = segments[segments.length - 1] || '';
    const filtered = completions.filter(c => c.label.startsWith(lastSegment));

    return {
        from: word.from,
        options: filtered
    };
}

export const customAutocomplete = autocompletion({ override: [customCompletionProvider] });


import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

import { Completion, CompletionLeaf, CompletionNode, CompletionTree } from "architecture/components/core";
import { requestHookCompletions } from "./config/RequestHookCompletions";
import { responseHookCompletions } from "./config/ResponseHookCompletions";
import { c } from "architecture";
import { javascriptLanguage } from "@codemirror/lang-javascript";

// Define the structure of the event object
const eventTree: CompletionTree = {
    event: {
        request: requestHookCompletions,
        file: {
            label: "file",
            type: "object",
            info: "TFile object of the file being processed",
            detail: "✨ ZettelFlow Hook",
            boost: 1
        },
        response: responseHookCompletions
    }
};

const eventCompletions: Completion[] = [
    {
        label: "event",
        type: "variable",
        info: "The main event object provided to hooks",
        detail: "✨ ZettelFlow Hook",
        boost: 99
    }
];


/**
 * Verify if the node is an array of Completion objects
 */
function isCompletionArray(node: unknown): node is Completion[] {
    return Array.isArray(node);
}

function findCompletions(
    segments: string[],
    node: CompletionTree | CompletionNode | CompletionLeaf
): Completion[] | null {
    // If the node is an array of completions, return it
    if (isCompletionArray(node)) return node;

    // If the current node is a Completion (leaf node)
    if ('label' in node && 'type' in node) {
        // If it's a leaf and there are no more segments, return it as a completion
        if (segments.length === 0) {
            return [node as Completion];
        }
        // If there are still segments but we hit a leaf, we can't go deeper
        return null;
    }

    // If there are no segments, return all direct children as completions
    if (segments.length === 0) {
        return Object.entries(node).map(([key, value]) => {
            // If the child has label and type, it's already a Completion object
            if (typeof value === 'object' && value !== null && 'label' in value && 'type' in value) {
                return value as Completion;
            }
            // Otherwise, create a completion from the key
            return {
                label: key,
                type: typeof value === 'object' ? 'object' : 'property',
                info: 'Hook API',
                boost: 99,
                detail: '✨ ZettelFlow Hook'
            };
        });
    }

    // Get the next segment without removing it
    const nextSegment = segments[0];

    // Check if the node has the next segment as a property
    if (!(nextSegment in node)) {
        // If the segment doesn't exist, return all available properties at this level
        return Object.entries(node).map(([key, value]) => {
            if (typeof value === 'object' && value !== null && 'label' in value && 'type' in value) {
                return value as Completion;
            }
            return {
                label: key,
                type: typeof value === 'object' ? 'object' : 'property',
                info: 'Hook API',
                boost: 99,
                detail: '✨ ZettelFlow Hook'
            };
        });
    }

    // Continue recursively with the next node
    const nextNode = node[nextSegment];

    // Make sure the next node is an object we can traverse
    if (typeof nextNode !== 'object' || nextNode === null) {
        return null;
    }

    // Move to the next segment
    return findCompletions(segments.slice(1), nextNode);
}

/**
 * Creates a custom renderer for Hook completions
 */
function createHookRenderer(completion: Completion): (element: HTMLElement) => void {
    return (element: HTMLElement) => {
        // Add a CSS class for styling
        element.classList.add(c('cm-completion'));
        element.classList.add(c('cm-hook-completion'));

        // Create a container for better styling
        const container = document.createElement('div');
        container.className = c('cm-completion-container');

        // Add Hook icon/badge
        const badge = document.createElement('span');
        badge.className = c('cm-completion-badge');
        badge.textContent = '⚓';

        // Label with custom styling
        const label = document.createElement('span');
        label.className = c('cm-completion-label');
        label.textContent = completion.label;

        // Type indicator
        const type = document.createElement('span');
        type.className = c('cm-completion-type');
        type.textContent = completion.type || 'property';

        // Assemble the elements
        container.appendChild(badge);
        container.appendChild(label);
        container.appendChild(type);

        // Clear and append to the element
        element.innerHTML = '';
        element.appendChild(container);
    };
}

function hookCompletionProvider(context: CompletionContext): CompletionResult | null {
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
            // Check if first segment is "event"
            const rootSegment = segments[0];
            if (rootSegment === 'event') {
                // Find completions for the event object and its properties
                const completions = findCompletions(segments, eventTree);
                if (completions && completions.length > 0) {
                    // Enhance all completions with Hook styling
                    const enhancedCompletions = completions.map(c => ({
                        ...c,
                        detail: c.detail || '✨ ZettelFlow Hook',
                        info: c.info || 'Hook API',
                        boost: c.boost || 99, // Prioritize over standard completions
                        render: c.render || createHookRenderer(c)
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

    // If first segment is "event", provide completions
    const rootSegment = segments[0];
    if (rootSegment === 'event') {
        // Find the completions for the current segments
        const completionSegments = [...segments];
        const lastSegment = completionSegments.pop() || '';
        const completions = findCompletions(completionSegments, eventTree);
        if (!completions || completions.length === 0) return null;

        // Filter the completions by the last segment
        const filtered = completions.filter(c => c.label.toLowerCase().startsWith(lastSegment.toLowerCase()));

        if (filtered.length === 0) return null;

        // Enhance all completions with Hook styling
        const enhancedCompletions = filtered.map(c => ({
            ...c,
            detail: c.detail || '✨ ZettelFlow Hook',
            info: c.info || 'Hook API',
            boost: c.boost || 99, // Prioritize over standard completions
            render: c.render || createHookRenderer(c)
        }));

        return {
            from: word.from + actualText.lastIndexOf(lastSegment),
            options: enhancedCompletions,
            validFor: /^[\w.]*$/
        };
    } else if (rootSegment.startsWith('e') && 'event'.startsWith(rootSegment)) {
        // Provide the 'event' global variable as a completion
        return {
            from: word.from,
            options: eventCompletions.map(c => ({
                ...c,
                render: c.render || createHookRenderer(c)
            })),
            validFor: /^e\w*$/
        };
    }

    return null;
}

export const hookAutocomplete = javascriptLanguage.data.of({
    autocomplete: hookCompletionProvider
});
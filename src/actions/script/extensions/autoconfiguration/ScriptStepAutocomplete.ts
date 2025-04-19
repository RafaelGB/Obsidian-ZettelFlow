import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";

import { Completion, CompletionTree } from "architecture/components/core";
import { noteCompletions } from "./config/NoteFns";
import { contentCompletions } from "./config/ContentFns";
import { c } from "architecture";

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
            info: 'ZF API',
            boost: 99, // Prioritize ZettelFlow completions
            detail: '✨ ZettelFlow Script Action' // Visual indicator for ZettelFlow
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
            info: 'ZF API',
            boost: 99,
            detail: '✨ ZettelFlow'
        }));
    }

    // Stop suggesting if we've reached a leaf node that's not a completion array or object
    if (typeof nextNode !== 'object' || nextNode === null) {
        return null;
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

        // Create a container for better styling
        const container = document.createElement('div');
        container.className = c('cm-completion-container');

        // Add ZettelFlow icon/badge
        const badge = document.createElement('span');
        badge.className = c('cm-completion-badge');
        badge.textContent = '✨';

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

export const scriptActionAutocomplete = javascriptLanguage.data.of({
    autocomplete: customCompletionProvider
});
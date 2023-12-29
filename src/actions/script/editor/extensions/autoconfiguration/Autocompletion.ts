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
function isCompletionArray(node: unknown): node is Completion[] {
    return Array.isArray(node);
}

function customCompletionProvider(context: CompletionContext): CompletionResult | null {
    // Obtains the word before the cursor
    const word = context.matchBefore(/\w*$/);
    if (!word) return null;

    // Suggest all completions after a dot
    const coreWord = context.matchBefore(/(\w+\.)*\w*$/);
    if (!coreWord || word.text.length >= 2) {
        return {
            from: word.from,
            options: coreCompletions.filter(c => c.label.startsWith(word.text.substring(0, word.text.length - 1)))
        };
    }
    // Split the word by dots
    const segments = coreWord.text.split('.');
    function findCompletions(segments: string[], node: Record<string, any> | Completion[]): Completion[] | null {
        if (isCompletionArray(node)) { return node; }
        if (segments.length === 0) { return null; }

        const nextSegment = segments.shift();
        if (!nextSegment) {
            // If there's no next segment, return the keys of the current node as completions.
            return Object.keys(node).map(key => ({ label: key, type: 'object', info: '' }));
        }

        const nextNode = node[nextSegment];
        if (!nextNode) {
            // If the next segment doesn't match, return the remaining keys at this level.
            return Object.keys(node).map(key => ({ label: key, type: 'object', info: '' }));
        }

        if (isCompletionArray(nextNode)) { return nextNode; }
        return findCompletions(segments, nextNode);
    }

    const completions = findCompletions(segments, completionsTree);

    if (!completions) return null;

    return {
        from: word.from,
        options: completions.filter(c => c.label.startsWith(word.text))
    };
}

export const customAutocomplete = autocompletion({ override: [customCompletionProvider] });
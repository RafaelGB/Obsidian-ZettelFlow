import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { coreCompletions } from "./config/CoreObjs";
import { contentCompletions } from "./config/ContentFns";
import { noteCompletions } from "./config/NoteFns";
import { appCompletions } from "./config/AppFns";


function customCompletionProvider(context: CompletionContext): CompletionResult | null {
    // Obtains the word before the cursor
    const word = context.matchBefore(/\w*$/);
    if (!word) return null;
    // Suggest core ot methods (note, content, etc.) if there is NOT a dot inside the wordbjec
    const coreWord = context.matchBefore(/\w*\.\w*$/);
    if (!coreWord && word.text.length >= 2) {
        return {
            from: word.from,
            options: coreCompletions.filter(c => c.label.startsWith(word.text.substring(0, word.text.length - 1)))
        };
    }

    let completions;
    if (context.matchBefore(/note\.\w*$/)) {
        completions = noteCompletions;
    } else if (context.matchBefore(/content\.\w*$/)) {
        completions = contentCompletions;
    } else if (context.matchBefore(/app\.\w*$/)) {
        completions = appCompletions;
    } else {
        return null; // No completions
    }

    return {
        from: word.from,
        options: completions.filter(c => c.label.startsWith(word.text))
    };
}

export const customAutocomplete = autocompletion({ override: [customCompletionProvider] });
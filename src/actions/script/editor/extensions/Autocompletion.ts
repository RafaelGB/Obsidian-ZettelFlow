import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

const noteCompletions = [
    { label: 'setTitle', type: 'method', info: 'setTitle(title: string):NoteDTO => update the title of the note' },
];

const contentCompletions = [
    { label: 'add', type: 'method', info: 'add(content: string): Add new content to the note' },
];

const coreCompletions = [
    { label: 'note', type: 'object', info: 'note: NoteDTO => The note being edited' },
    { label: 'content', type: 'object', info: 'content: ContentDTO => The content of the note' },
];

function customCompletionProvider(context: CompletionContext): CompletionResult | null {
    // Obtains the word before the cursor
    const word = context.matchBefore(/\w*/);

    if (!word) return null;
    // Suggest core object methods (note, content, etc.) if there is NOT a dot inside the word
    const coreWord = context.matchBefore(/\w*\.\w*$/);
    if (!coreWord) {
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
    } else {
        return null; // No hay sugerencias si no estamos en un contexto relevante
    }

    return {
        from: word.from,
        options: completions.filter(c => c.label.startsWith(word.text))
    };
}

// La extensión de autocompletado personalizado
export const customAutocomplete = autocompletion({ override: [customCompletionProvider] });
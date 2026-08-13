/**
 * Pure prompt builder for `generate-questions` (#156, FR-6/D5). Asks the provider for the open
 * questions the note-being-built content raises, one per line. Obsidian-free and deterministic.
 */
export function buildQuestionsPrompt(content: string): string {
    return (
        "Generate a few open questions this note raises. " +
        "Respond with one question per line and nothing else.\n\n" +
        content.trim()
    );
}

/**
 * Pure parser (#156, AC-2) turning the provider's line/number/bullet list into questions with the
 * list markers stripped. Blank lines dropped; empty input ⇒ `[]`.
 */
export function parseQuestions(text: string): string[] {
    const questions: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const question = raw.trim().replace(/^(\d+[.)]|[-*•])\s*/, "").trim();
        if (question) questions.push(question);
    }
    return questions;
}

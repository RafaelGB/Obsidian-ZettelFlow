/**
 * Pure prompt builder for `summarize` (#156, FR-6/D5). Wraps the note-being-built content in a
 * summarize instruction. Obsidian-free and deterministic.
 */
export function buildSummarizePrompt(content: string): string {
    return (
        "Summarize the following note in a few clear sentences. " +
        "Respond with only the summary, no preamble.\n\n" +
        content.trim()
    );
}

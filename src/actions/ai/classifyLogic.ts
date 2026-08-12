/**
 * Pure prompt builder for `classify` (#156, FR-6/D5). Asks the provider for a short list of topic
 * tags for the note-being-built content. Obsidian-free and deterministic.
 */
export function buildClassifyPrompt(content: string): string {
    return (
        "Suggest 3-5 topic tags for the following note. " +
        "Respond with a comma-separated list of short lowercase tags and nothing else.\n\n" +
        content.trim()
    );
}

/**
 * Pure parser (#156, AC-2) turning the provider's comma/newline text into trimmed, de-duplicated
 * labels (list markers stripped). Empty input ⇒ `[]`.
 */
export function parseClassification(text: string): string[] {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const raw of text.split(/[,\n]/)) {
        const label = raw.trim().replace(/^[-*#•]+\s*/, "").trim();
        if (!label) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        labels.push(label);
    }
    return labels;
}

/**
 * Pure helpers for the multi-note `synthesize` action (#184): extract the wikilink targets from the
 * note being built and build a synthesis prompt across their contents. The file reads themselves live
 * in the action's `execute` (Obsidian-dependent); everything here is Obsidian-free and deterministic.
 */

/** A resolved source note fed to the synthesis prompt. */
export interface SynthesisSource {
    title: string;
    content: string;
}

/** Every distinct `[[wikilink]]` note name in the content, with alias/heading stripped, in order. */
export function extractWikilinks(content: string): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    const pattern = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
        const name = match[1].split(/[#|]/)[0].trim();
        if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }
    return names;
}

/**
 * Build the synthesis prompt from the resolved source notes. Each source becomes a titled block; the
 * model is asked for the common threads, tensions and what they add up to. Empty input ⇒ the header
 * with no blocks (callers should skip when there are no sources).
 */
export function buildSynthesisPrompt(sources: SynthesisSource[]): string {
    const blocks = sources.map((source) => `## ${source.title}\n${source.content.trim()}`).join("\n\n");
    return (
        "Synthesize the notes below into a coherent summary: identify the common threads, the " +
        "tensions between them, and what they add up to. Respond in prose.\n\n" +
        blocks
    );
}

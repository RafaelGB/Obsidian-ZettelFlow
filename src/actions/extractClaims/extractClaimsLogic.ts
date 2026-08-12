import type { Claim, Source } from "architecture/knowledge/model/Idea";

/** The `{ claim, source }` frontmatter shape `ClaimSourceSchema` round-trips (#148). */
export interface SerializedClaims {
    claim: string[];
    source: string[];
}

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

function sourceToken(source: Source): string {
    return source.kind === "link" ? `[[${basename(source.ref)}]]` : source.ref;
}

/**
 * Pure serializer for `extract-claims` (#155, FR-2/D7). Turns a note's model {@link Claim}s into the
 * `{ claim: string[], source: string[] }` frontmatter shape — claim texts, note-level sources with
 * link kind as an extensionless `[[basename]]` and text kind verbatim, deduped. Feeding the result
 * back through `ClaimSourceSchema.parse` reproduces the original claims (AC-1). Obsidian-free.
 */
export function serializeClaims(claims: Claim[]): SerializedClaims {
    const claim: string[] = [];
    const source: string[] = [];
    const seen = new Set<string>();
    for (const entry of claims) {
        if (entry.text) claim.push(entry.text);
        for (const src of entry.sources) {
            const key = src.kind === "link" ? `link:${src.ref}` : `text:${src.ref.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            source.push(sourceToken(src));
        }
    }
    return { claim, source };
}

import { SOURCE_KEYS } from "architecture/knowledge/claims/keys";

/** A source as a frontmatter field: the `source` key and the raw value the user supplied. */
export interface SourceField {
    key: string;
    value: string;
}

/**
 * Pure builder for `attach-source` (#155, FR-4/D3). Given a raw source value — a `[[wikilink]]` to a
 * note or free text (URL / DOI / citation) — returns the frontmatter field `{ key: "source", value }`
 * (value kept verbatim), which `ClaimSourceSchema` then classifies as a note-level source (AC-1).
 * An empty/blank value is a safe no-op (`null`, nothing written). Obsidian-free and deterministic.
 */
export function sourceField(raw: string): SourceField | null {
    const value = (raw ?? "").trim();
    if (!value) return null;
    return { key: SOURCE_KEYS[0], value };
}

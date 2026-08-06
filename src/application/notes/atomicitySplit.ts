/**
 * Pure core for the atomicity split assist.
 *
 * Obsidian-free so it can be unit-tested. A note body is parsed into its frontmatter, a preamble
 * (everything before the first top-level heading) and one section per top-level (`# `) heading.
 * The split is designed so a caller can reassemble the original input byte-for-byte, and so the
 * source note can be rewritten with each split-out section replaced by a single wikilink while
 * excluded sections, the preamble and the frontmatter are preserved verbatim.
 */

/** A single top-level section of a parsed note. */
export interface NoteSection {
    /** The heading text (without the leading `#`, trimmed). */
    heading: string;
    /** The raw heading line, e.g. `"# My topic"`. */
    headingLine: string;
    /** Section content INCLUDING its heading line, verbatim (with its trailing newlines). */
    body: string;
    /** Proposed atomic-note title derived from the heading. */
    title: string;
}

/** A note split into its frontmatter, preamble and top-level sections. */
export interface ParsedNote {
    /** The raw frontmatter block incl. delimiters + trailing newline, or `""`. */
    frontmatter: string;
    /** Body text before the first top-level heading (may be `""`). */
    preamble: string;
    /** One entry per top-level (`# `) heading. */
    sections: NoteSection[];
}

/** Pairs a section with the final basename of the note it was split into. */
export interface SectionReplacement {
    section: NoteSection;
    linkBasename: string;
}

/** Frontmatter block at the very top of a note (same shape used across the codebase). */
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** A top-level heading line: exactly one `#`, a space, then non-whitespace content. */
const TOP_LEVEL_HEADING_RE = /^# \S/gm;

/** Characters that are illegal in Obsidian note names. */
const ILLEGAL_TITLE_CHARS_RE = /[[\]#^|/\\:]/g;

/** Returns the run of newlines at the very end of a string (may be `""`). */
function trailingNewlines(value: string): string {
    const match = value.match(/(?:\r?\n)+$/);
    return match ? match[0] : "";
}

/**
 * Splits the frontmatter off the top, then segments the remaining body into a preamble
 * (everything before the first top-level heading) and one section per top-level heading.
 *
 * CONTENT-PRESERVATION INVARIANT (AC-4): for any input,
 * `frontmatter + preamble + sections.map(s => s.body).join("")` reconstructs the ORIGINAL input
 * exactly — no loss, reordering or duplication.
 */
export function parseNote(input: string): ParsedNote {
    const fmMatch = input.match(FRONTMATTER_RE);
    const frontmatter = fmMatch ? fmMatch[0] : "";
    const rest = input.slice(frontmatter.length);

    const indices: number[] = [];
    TOP_LEVEL_HEADING_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOP_LEVEL_HEADING_RE.exec(rest)) !== null) {
        indices.push(match.index);
    }

    if (indices.length === 0) {
        return { frontmatter, preamble: rest, sections: [] };
    }

    const preamble = rest.slice(0, indices[0]);
    const sections: NoteSection[] = [];
    for (let i = 0; i < indices.length; i++) {
        const start = indices[i];
        const end = i + 1 < indices.length ? indices[i + 1] : rest.length;
        const body = rest.slice(start, end);
        const newlineIdx = body.indexOf("\n");
        const headingLine = (newlineIdx === -1 ? body : body.slice(0, newlineIdx)).replace(/\r$/, "");
        const heading = headingLine.replace(/^#+\s*/, "").trim();
        sections.push({ heading, headingLine, body, title: deriveTitle(heading) });
    }

    return { frontmatter, preamble, sections };
}

/**
 * Derives a filesystem-safe atomic-note title from a heading: strips leading `#` markers,
 * removes characters illegal in Obsidian note names (`[]#^|/\:`), collapses runs of whitespace
 * to a single space and trims. Keeps the result readable.
 */
export function deriveTitle(heading: string): string {
    return heading
        .replace(/^#+\s*/, "")
        .replace(ILLEGAL_TITLE_CHARS_RE, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Builds the body of a new atomic note: the section body (verbatim, including its heading, with
 * trailing whitespace trimmed) followed by a backlink line to the source note. When a
 * `backlinkPrefix` is given it precedes the link (e.g. `"Split from [[Source]]"`).
 */
export function buildAtomicNoteBody(
    section: NoteSection,
    sourceBasename: string,
    backlinkPrefix?: string
): string {
    const trimmedBody = section.body.replace(/\s+$/, "");
    const link = `[[${sourceBasename}]]`;
    const backlink = backlinkPrefix ? `${backlinkPrefix} ${link}` : link;
    return `${trimmedBody}\n\n${backlink}\n`;
}

/**
 * Rewrites the source body: each section present in `replacements` (with a non-empty
 * `linkBasename`) is replaced by a single `[[linkBasename]]` line, keeping the section's original
 * trailing newlines so inter-section whitespace is preserved. Sections NOT in the map, the
 * preamble and the frontmatter are preserved verbatim. Never emits an empty/dangling `[[]]`.
 */
export function rewriteSourceBody(parsed: ParsedNote, replacements: SectionReplacement[]): string {
    const bySection = new Map<NoteSection, string>();
    for (const replacement of replacements) {
        if (replacement.linkBasename.trim() !== "") {
            bySection.set(replacement.section, replacement.linkBasename);
        }
    }

    let out = parsed.frontmatter + parsed.preamble;
    for (const section of parsed.sections) {
        const linkBasename = bySection.get(section);
        if (linkBasename !== undefined) {
            out += `[[${linkBasename}]]${trailingNewlines(section.body)}`;
        } else {
            out += section.body;
        }
    }
    return out;
}

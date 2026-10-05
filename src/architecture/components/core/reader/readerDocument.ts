/**
 * **One document from a reading** (#672) — pure: chapters and highlights in, Markdown out.
 *
 * Two ways to carry a chapter:
 * - **embed** (the default): `![[note]]`. Nothing is duplicated, and the export stays live — fix a
 *   note and the document shows the fix. It is the vault's own way of quoting a whole note.
 * - **copy**: the note's text as it reads today, for a document that has to stand on its own
 *   (sent to someone, printed, archived).
 *
 * Every label arrives from the caller, already in your language, so this stays a pure function.
 */
export type ExportMode = "embed" | "copy";

export interface ExportChapter {
    /** The note's name, shown as the chapter heading. */
    name: string;
    /** What `![[…]]` needs to reach the note from where the export will live. */
    link: string;
    /** The note's text, frontmatter removed — only read in copy mode. */
    body?: string;
}

export interface ExportHighlight {
    /** The note the passage is in, by name. */
    note: string;
    passage: string;
    /** Your margin note, if you wrote one. */
    comment?: string;
}

export interface ExportInput {
    title: string;
    /** One line under the title: how and when it was read. */
    intro: string;
    chapters: readonly ExportChapter[];
    highlights: readonly ExportHighlight[];
    mode: ExportMode;
    /** The heading of the highlights appendix. */
    appendixTitle: string;
}

/** A note's body without its frontmatter: the properties are not part of what you read. */
export function stripFrontmatter(markdown: string): string {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/** A passage as a Markdown quote, one `>` per line, so a multi-line highlight stays one quote. */
function quote(text: string): string {
    return text
        .trim()
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join("\n");
}

export function buildReadingDocument(input: ExportInput): string {
    const out: string[] = [`# ${input.title}`, "", input.intro, ""];
    input.chapters.forEach((chapter, i) => {
        out.push(`## ${i + 1}. ${chapter.name}`, "");
        if (input.mode === "copy") out.push((chapter.body ?? "").trim() || `![[${chapter.link}]]`, "");
        else out.push(`![[${chapter.link}]]`, "");
    });
    if (input.highlights.length > 0) {
        out.push(`## ${input.appendixTitle}`, "");
        let current = "";
        for (const highlight of input.highlights) {
            if (highlight.note !== current) {
                out.push(`### ${highlight.note}`, "");
                current = highlight.note;
            }
            out.push(quote(highlight.passage), "");
            if (highlight.comment?.trim()) out.push(highlight.comment.trim(), "");
        }
    }
    return `${out.join("\n").trimEnd()}\n`;
}

/** Characters Obsidian (and every file system it runs on) will not take in a file name. */
const UNSAFE = /[\\/:*?"<>|#^[\]]/g;

/** A file name for the export: the reading's name, made safe, `.md` added. */
export function exportFileName(name: string): string {
    const clean = name.replace(UNSAFE, " ").replace(/\s+/g, " ").trim() || "Reading";
    return clean.toLowerCase().endsWith(".md") ? clean : `${clean}.md`;
}

/**
 * Where the export goes without touching anything that exists: `folder/name.md`, or `name 2.md`,
 * `name 3.md`… until a free one. Create-only — an export never overwrites a note.
 */
export function freeExportPath(folder: string, fileName: string, exists: (path: string) => boolean): string {
    const dir = folder.replace(/\/+$/, "");
    const join = (file: string) => (dir ? `${dir}/${file}` : file);
    const stem = fileName.replace(/\.md$/i, "");
    let candidate = join(`${stem}.md`);
    for (let n = 2; exists(candidate) && n < 1000; n++) candidate = join(`${stem} ${n}.md`);
    return candidate;
}

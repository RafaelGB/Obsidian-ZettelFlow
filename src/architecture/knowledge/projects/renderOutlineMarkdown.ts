import type { Outline } from "./deriveOutline";

/** The `.md`-stripped path — an unambiguous wikilink target (avoids basename collisions vault-wide). */
function linkTarget(path: string): string {
    return path.replace(/\.md$/i, "");
}

/** Folders + `.md` stripped — the readable display name for the wikilink. */
function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * Pure MOC renderer for a derived-project {@link Outline} (#173): an H1 title, a `##` heading per
 * section, and a `- [[path|name]]` bullet per source note (path-qualified so a basename shared with a
 * note elsewhere in the vault can't mis-resolve). Obsidian-free and i18n-free (the title is injected).
 * Ends with a single trailing newline.
 */
export function renderOutlineMarkdown(outline: Outline, opts: { title: string }): string {
    const lines: string[] = [`# ${opts.title}`];
    for (const section of outline.sections) {
        lines.push("", `## ${section.title}`, "");
        for (const note of section.notes) lines.push(`- [[${linkTarget(note)}|${basename(note)}]]`);
    }
    return `${lines.join("\n").trimEnd()}\n`;
}

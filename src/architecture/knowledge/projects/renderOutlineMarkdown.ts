import type { Outline } from "./deriveOutline";

/** Strip folders and the `.md` extension so a path renders as a wikilink target. */
function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * Pure MOC renderer for a derived-project {@link Outline} (#173): an H1 title, a `##` heading per
 * section, and a `- [[basename]]` bullet per source note. Obsidian-free and i18n-free (the title is
 * injected). Ends with a single trailing newline.
 */
export function renderOutlineMarkdown(outline: Outline, opts: { title: string }): string {
    const lines: string[] = [`# ${opts.title}`];
    for (const section of outline.sections) {
        lines.push("", `## ${section.title}`, "");
        for (const note of section.notes) lines.push(`- [[${basename(note)}]]`);
    }
    return `${lines.join("\n").trimEnd()}\n`;
}

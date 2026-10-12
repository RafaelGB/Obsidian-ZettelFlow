import { MarkdownRenderer, type App, type Component, type TFile } from "obsidian";
import { articleFields, articleSections, type ArticleSection } from "application/library/article";
import { titleFromName } from "application/library/shelf";
import { languageTag } from "application/library/sourceMeta";
import { stripFrontmatter } from "architecture/components/core/reader/readerDocument";
import type { DrawnChapter, SourceDocument, SourceTocEntry } from "./sourceDocument";

/** The fragment a heading is known by inside its section: its place among the section's headings. */
const headingId = (index: number) => `zf-heading-${index}`;

/**
 * **An article in the Reader** (#744, epic #742): a page you saved with Web Clipper, read like a book.
 * Its sections are its headings at the shallowest level it uses; Contents lists every heading.
 *
 * The note is read through the Vault API (`cachedRead`) and drawn by Obsidian's own Markdown renderer
 * — the one the Reader draws your notes with, so it reads in the same type and theme. It is **never
 * written** (FR-10): a highlight is a thought about it, the place is plugin data. ZettelFlow fetches
 * nothing; a picture inside the clipping is loaded by Obsidian's renderer, exactly as in the editor.
 *
 * A footnote is read where it is referenced (#718): each section carries the notes it mentions, and
 * the marks and notes are named the way the Reader's footnotes are found.
 */
export async function openArticleSource(app: App, file: TFile): Promise<SourceDocument> {
    const markdown = await app.vault.cachedRead(file);
    const frontmatter = app.metadataCache.getFileCache?.(file)?.frontmatter;
    const fields = articleFields(frontmatter);
    // The language a clipping says it is in (`lang`): its column and its voice read by it (#757, #765).
    const language = languageTag(frontmatter?.lang ?? frontmatter?.language);
    const title = fields.details.title ?? titleFromName(file.name);
    const sections: ArticleSection[] = articleSections(stripFrontmatter(markdown), title);
    const toc: SourceTocEntry[] = [];
    sections.forEach((section, chapter) => {
        // The section's own heading opens it; the ones under it are places inside it.
        const opens = section.headings[0]?.title === section.title;
        if (!opens) toc.push({ title: section.title, chapter, depth: 0 });
        const top = opens ? section.headings[0].depth : (section.headings[0]?.depth ?? 1);
        section.headings.forEach((heading, i) => {
            const depth = Math.max(0, heading.depth - top) + (opens ? 0 : 1);
            toc.push({ title: heading.title, chapter, depth, ...(i > 0 || !opens ? { fragment: headingId(i) } : {}) });
        });
    });
    const author = fields.details.author?.join(", ") ?? fields.host;

    return {
        format: "article",
        path: file.path,
        title,
        ...(author ? { author } : {}),
        ...(language ? { language } : {}),
        chapters: sections.map((section) => ({ label: section.title })),
        toc,
        imageOnly: false,
        hasPageView: false,
        async draw(index: number, body: HTMLElement, component: Component): Promise<DrawnChapter> {
            const section = sections[index];
            if (!section) throw new Error(`no section ${index}`);
            await MarkdownRenderer.render(app, section.markdown, body, file.path, component);
            // A footnote's mark and its note, named the way the Reader finds a book's (#718).
            for (const el of Array.from(body.querySelectorAll("[id]"))) el.setAttribute("data-zf-id", el.getAttribute("id") ?? "");
            // Every heading by its place in the section, so Contents can land on it.
            Array.from(body.querySelectorAll("h1, h2, h3, h4, h5, h6")).forEach((heading, i) => heading.setAttribute("data-zf-id", headingId(i)));
            for (const link of Array.from(body.querySelectorAll("a"))) {
                const href = link.getAttribute("href") ?? "";
                if (href.startsWith("#")) link.setAttribute("data-zf-href", href);
            }
            const text = body.textContent ?? "";
            return { words: text.split(/\s+/).filter(Boolean).length, picture: false };
        },
        resolveLink(fromChapter: number, href: string) {
            // Only a place in this section — a footnote and its way back. A link to the web, or to a
            // note, leaves the article, and the Reader never follows one (L1).
            if (!href.startsWith("#") || href.length < 2) return null;
            let fragment = href.slice(1);
            try {
                fragment = decodeURIComponent(fragment);
            } catch {
                // Not encoded: the fragment as written.
            }
            return { chapter: fromChapter, fragment };
        },
        close(): void {
            // Nothing held: the note was read once, and each section is drawn again when it is turned to.
        },
    };
}

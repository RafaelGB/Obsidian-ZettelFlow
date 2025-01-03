import ZettelFlow from "main";
import { App, Component, MarkdownRenderer, MarkdownView } from "obsidian";

/**
 * Represents an entry within the Table of Contents (TOC).
 */
type TOCEntry = {
    level: number;
    text: string;
    id: string;
};

/**
 * Registers a listener to generate and render the Table of Contents whenever
 * the layout changes and the active view is a Markdown preview.
 */
export function loadTOCProcessors(plugin: ZettelFlow): void {
    plugin.registerEvent(
        plugin.app.workspace.on("layout-change", () => {
            const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView?.file) return;

            // Only proceed if the active view is in 'preview' mode
            if (activeView.getMode() === "preview") {
                const container = activeView.containerEl.querySelector(".view-content") as HTMLElement;
                if (!container) return;

                // Generate the TOC from the headers in the note
                const toc = generateTOC(container);

                // Find either the metadata container or inline title to anchor the TOC
                const anchorElement =
                    activeView.containerEl.querySelector(".metadata-container") ||
                    activeView.containerEl.querySelector(".inline-title");

                if (anchorElement) {
                    // Remove all existing TOC containers in case they exist
                    const existingTOCs = container.querySelectorAll(".zettelkasten-flow__toc-container");
                    existingTOCs.forEach((tocEl) => tocEl.remove());

                    // Check your plugin settings before rendering
                    if (!plugin.settings.tableOfContentEnabled) return;

                    renderTOCAtTop(
                        plugin.app,
                        anchorElement as HTMLElement,
                        toc,
                        activeView.file.path
                    );
                }
            }
        })
    );
}

/**
 * Extracts headers (h1-h6) from the note preview and creates an array of
 * TOCEntry objects containing level, text, and an ID for each header.
 *
 * @param container - The root container of the Markdown preview content.
 * @returns An array of TOCEntry objects representing each header.
 */
function generateTOC(container: HTMLElement): TOCEntry[] {
    const headers = Array.from(container.querySelectorAll("h1, h2, h3, h4, h5, h6"));

    return headers.map((header) => {
        const headerValue = header.textContent ?? "";
        return {
            level: Number(header.tagName[1]), // Convert "H1", "H2", etc. to an integer 1–6
            text: headerValue,
            id: header.getAttribute("id") || slugify(headerValue.trim()),
        };
    });
}

/**
 * Renders the Table of Contents at the top of the note as a hierarchical
 * tree using nested <ul> and <li> elements.
 *
 * @param app - The Obsidian App instance.
 * @param container - The element after which the TOC will be inserted.
 * @param toc - The array of TOCEntry objects to render.
 * @param sourcePath - The path of the currently open Markdown file.
 */
function renderTOCAtTop(
    app: App,
    container: HTMLElement,
    toc: TOCEntry[],
    sourcePath: string
): void {
    // If no headers are found, do not render a TOC
    if (toc.length === 0) return;

    // Create a fresh TOC container
    const tocContainer = document.createElement("div");
    tocContainer.className = "zettelkasten-flow__toc-container";

    // Create the root UL that will hold all top-level items
    const rootUl = document.createElement("ul");
    tocContainer.appendChild(rootUl);

    // This stack will keep track of the current <ul> for each heading level.
    // Index 0 → for level 1, index 1 → for level 2, etc.
    const ulStack: HTMLUListElement[] = [];
    ulStack[0] = rootUl;

    // Hierarchical counters (optional) if you want numeric prefix like "1.1.2"
    const counters = Array(6).fill(0);

    // We need a component to render Obsidian markdown links
    const tocComponent = new Component();

    toc.forEach((entry) => {
        // Update counters for hierarchical numbering
        counters[entry.level - 1]++;
        for (let i = entry.level; i < counters.length; i++) {
            counters[i] = 0;
        }

        // Make sure we have a <ul> for this level; if not, create one
        // and nest it under the previous level's <li>.
        if (!ulStack[entry.level - 1]) {
            const newUl = document.createElement("ul");
            ulStack[entry.level - 2].lastElementChild?.appendChild(newUl);
            ulStack[entry.level - 1] = newUl;
        }

        // Construct the link text (with or without numbering)
        const numbering = counters
            .slice(0, entry.level)
            .filter((cnt) => cnt > 0)
            .join(".");

        // Create the <li> element for the current heading
        const li = document.createElement("li");

        // Create the Obsidian link for the heading
        const mdLink = `[[${sourcePath}#${entry.text}|${numbering ? numbering + " " : ""}${entry.text}]]`;

        // Render the link markdown into the <li> directly
        MarkdownRenderer.render(app, mdLink, li, sourcePath, tocComponent);

        // Append the <li> to the correct <ul>
        ulStack[entry.level - 1].appendChild(li);
    });

    // Insert the TOC container right after the specified anchor container
    container.parentElement?.insertBefore(tocContainer, container.nextSibling);
}

/**
 * Converts a given text into a URL-friendly slug, suitable for IDs or links.
 *
 * @param text - The string to slugify.
 * @returns A slugified version of the input string.
 */
function slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w]+/g, "-");
}

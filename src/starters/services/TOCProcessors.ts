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
                    // Remove all existing TOC containers to prevent duplicates
                    const existingTOCs = container.querySelectorAll(".zettelkasten-flow__toc-container");
                    existingTOCs?.forEach((tocEl) => tocEl.remove());
                    // Only proceed if the TOC feature is enabled
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
            id: header.getAttribute("id") || slugify(headerValue.trim())
        };
    });
}

/**
 * Renders the Table of Contents at the top of the note. If a TOC container
 * already exists, it is removed first to prevent duplicate or stale content.
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

    // Initialize counters for hierarchical numbering (1, 1.1, 1.2, etc.)
    const counters = Array(6).fill(0);

    // A component is required to render Markdown links properly
    const tocComponent = new Component();

    toc.forEach((entry) => {
        // Increment counter for current level
        counters[entry.level - 1]++;
        // Reset counters for deeper levels
        for (let i = entry.level; i < counters.length; i++) {
            counters[i] = 0;
        }

        // Build hierarchical numbering (e.g., "1", "1.1", "2.1.1")
        const number = counters
            .slice(0, entry.level)
            .filter((count) => count > 0)
            .join(".");

        // Construct the Obsidian link for each header
        const mdLink = `[[${sourcePath}#${entry.text}|${number} ${entry.text}]]`;

        // Render the link into the TOC container
        MarkdownRenderer.render(app, mdLink, tocContainer, sourcePath, tocComponent);
    });

    // Insert the TOC right after the specified container
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

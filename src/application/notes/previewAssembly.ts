import { substituteContextTokens } from "./contextTokens";

/**
 * A single step template contributing to the assembled note: its body (without frontmatter)
 * and its parsed frontmatter object (excluding the internal `zettelFlowSettings`).
 */
export interface PreviewTemplate {
    body: string;
    frontmatter: Record<string, unknown>;
}

/**
 * A captured action result, mirroring the fields the real actions read from a `FinalElement`.
 * Only the subset the preview needs is typed here so the function stays Obsidian-free.
 */
export interface PreviewElement {
    type?: string;
    zone?: string;
    key?: unknown;
    result?: unknown;
    staticBehaviour?: boolean;
    staticValue?: unknown;
}

export interface AssembleNotePreviewInput {
    title: string;
    /** Step templates in position order. */
    templates: PreviewTemplate[];
    /** Captured action results in position order. */
    elements: PreviewElement[];
    /** Frontmatter of the source note (for {{frontmatter.KEY}}); {} when absent. */
    sourceFrontmatter?: Record<string, unknown>;
    /** Canvas basename (for {{canvas.name}}). */
    canvasName?: string;
    /** Recorded connection links, appended to the body as [[wikilinks]]. */
    links?: string[];
}

export interface NotePreview {
    title: string;
    frontmatter: Record<string, unknown>;
    body: string;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringifyValue(value: unknown): string {
    if (Array.isArray(value)) {
        return value.map((item) => String(item)).join(", ");
    }
    return String(value);
}

/**
 * Reproduces {@link NoteBuilder.buildNote} entirely in memory so a companion pane can preview
 * the note without creating, modifying, or deleting any vault file.
 *
 * Pure and Obsidian-free: the React caller performs the async file reads and then hands the
 * loaded template bodies/frontmatter plus the captured action results to this function.
 *
 * Mirrors the real pipeline order: merge templates -> context tokens -> action results by
 * zone -> {{title}} -> append recorded links.
 */
export function assembleNotePreview(input: AssembleNotePreviewInput): NotePreview {
    const {
        title,
        templates,
        elements,
        sourceFrontmatter = {},
        canvasName = "",
        links = [],
    } = input;

    let frontmatter: Record<string, unknown> = {};
    const tags: string[] = [];
    let body = "";

    const addTags = (value: unknown): void => {
        if (value === null || value === undefined) return;
        if (typeof value === "string") {
            if (value && !tags.includes(value)) tags.push(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (typeof item === "string" && item && !tags.includes(item)) tags.push(item);
            });
        }
    };

    // 1. Merge template frontmatter (tags pulled out and de-duplicated) and concatenate bodies.
    for (const template of templates) {
        const templateFrontmatter = { ...template.frontmatter };
        if (templateFrontmatter.tags !== undefined) {
            addTags(templateFrontmatter.tags);
            delete templateFrontmatter.tags;
        }
        frontmatter = { ...frontmatter, ...templateFrontmatter };
        body = body.concat(template.body ?? "");
    }

    // 2. Substitute context tokens ({{frontmatter.KEY}}, {{canvas.name}}) on the merged body.
    body = substituteContextTokens(body, sourceFrontmatter, canvasName);

    // 3. Apply captured action results by zone.
    for (const element of elements) {
        const value = element.staticBehaviour ? element.staticValue : element.result;
        if (value === null || value === undefined) continue;

        const key = typeof element.key === "string" ? element.key : undefined;

        // Tag actions (and any frontmatter key named "tags") merge into the tag list.
        if (element.type === "tags" || key === "tags") {
            addTags(value);
            continue;
        }
        if (!key) continue;

        const zone = element.zone ?? "frontmatter";
        switch (zone) {
            case "body":
                body = body.replace(
                    new RegExp(`{{${escapeRegExp(key)}}}`, "g"),
                    stringifyValue(value)
                );
                break;
            case "context":
                // Context values feed later actions; they are not part of the visible note.
                break;
            case "frontmatter":
            default:
                frontmatter[key] = value;
        }
    }

    // 4. Replace {{title}} in the body for readability.
    body = body.replace(/{{title}}/g, title ?? "");

    // 5. Append recorded connection links as wikilinks.
    if (links.length > 0) {
        const wikilinks = links.map((link) => `[[${link}]]`).join("\n");
        const separator = body.length === 0 || body.endsWith("\n") ? "\n" : "\n\n";
        body = body.concat(separator, wikilinks, "\n");
    }

    // 6. Surface merged tags in the frontmatter (mirrors processTypedFrontMatter).
    const finalFrontmatter: Record<string, unknown> = { ...frontmatter };
    if (tags.length > 0) {
        finalFrontmatter.tags = tags;
    }

    return { title, frontmatter: finalFrontmatter, body };
}

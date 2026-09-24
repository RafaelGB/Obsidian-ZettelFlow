import { TFile } from "obsidian";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

/**
 * When each claim-bearing note was last reviewed (#563).
 *
 * `settings.lifecycle.lastReviewedProperty` has existed since the lifecycle vocabulary shipped, and
 * **nothing in the product has ever read it**: the settings row writes the property's *name*, and
 * that is the end of it. This is its first reader.
 *
 * It has to live here rather than inside the pure selection because an {@link Idea} carries no
 * frontmatter — the model is a projection, not a copy of the note. So the caller resolves the dates
 * through the metadata cache (never a file read) and hands them in.
 *
 * Only notes that actually say something are looked up: the map is an input to a claim decision,
 * and walking a whole vault's frontmatter to answer a question about a handful of notes would be
 * the kind of cost #458 exists to refuse.
 */
export function lastReviewedOf(model: KnowledgeModel, property?: string): Record<string, number> {
    const key = property?.trim();
    if (!key) return {};
    const metadataCache = ObsidianApi.metadataCache();
    const vault = ObsidianApi.vault();
    const reviewed: Record<string, number> = {};
    for (const idea of model.all()) {
        if (idea.claims.length === 0) continue;
        const file = vault.getFileByPath(idea.path);
        if (!(file instanceof TFile)) continue;
        const raw: unknown = metadataCache.getFileCache(file)?.frontmatter?.[key];
        const at = toTime(raw);
        if (at !== undefined) reviewed[idea.path] = at;
    }
    return reviewed;
}

/** A date property, however the user wrote it. Anything unparseable is simply not a review date. */
function toTime(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const parsed = Date.parse(value.trim());
    return Number.isNaN(parsed) ? undefined : parsed;
}

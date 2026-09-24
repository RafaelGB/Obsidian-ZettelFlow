import { TFile } from "obsidian";
import { ObsidianApi } from "architecture";
import { wagerOf, type Wager } from "architecture/knowledge/claims";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

/**
 * The wagers a vault is holding (#571).
 *
 * Lives here rather than inside the pure selection for the reason `lastReviewedOf` does: an
 * {@link Idea} carries no frontmatter — the model is a projection, not a copy of the note — so the
 * caller resolves them through the metadata cache and hands them in.
 *
 * **No thinking space, no wager.** Resolving one writes the observation as a thought, and a wager
 * that comes due with nowhere to put the answer is an invitation the product cannot honour. So the
 * whole map is empty when the Lab has no folder, the due selection falls back to an ordinary claim
 * return, and Home stays quiet rather than nagging — the #562 precedent, where the answer that needs
 * the Lab is **absent** rather than disabled.
 */
export function wagersOf(model: KnowledgeModel): Record<string, Wager> {
    if (!ThoughtStore.getInstance().folder()) return {};

    const metadataCache = ObsidianApi.metadataCache();
    const vault = ObsidianApi.vault();
    const wagers: Record<string, Wager> = {};
    for (const idea of model.all()) {
        if (idea.claims.length === 0) continue;
        const file = vault.getFileByPath(idea.path);
        if (!(file instanceof TFile)) continue;
        const wager = wagerOf(metadataCache.getFileCache(file)?.frontmatter);
        if (wager) wagers[idea.path] = wager;
    }
    return wagers;
}

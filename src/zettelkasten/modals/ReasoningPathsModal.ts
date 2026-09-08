import { c } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { reasoningPaths, type Path } from "architecture/knowledge/state";
import { proposeReasoningLinks, type ReasoningLinkCandidate } from "architecture/knowledge/traverse/reasoningLinks";
import { makeActivatable } from "architecture/components/core/a11y";
import { App, Modal } from "obsidian";

type LocaleKey = Parameters<typeof t>[0];

/** i18n label for each argument-forward relation followed in a chain. */
const REL_LABEL_KEY: Record<string, LocaleKey> = {
    supports: "reasoning_paths_rel_supports",
    expands: "reasoning_paths_rel_expands",
    example: "reasoning_paths_rel_example",
    implements: "reasoning_paths_rel_implements",
};

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/**
 * A read-only lens (#166, #318 S4) that surfaces the **argument-forward reasoning chains** leaving the
 * active note — the single lines of reasoning (`supports → expands → example → implements`) computed by
 * the pure {@link reasoningPaths} projection. Every note in a chain is clickable and opens on click.
 * Reads only the {@link KnowledgeModel}; writes nothing and never mutates the vault.
 */
export class ReasoningPathsModal extends Modal {
    constructor(app: App, private readonly start: string) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass(c("reasoning-paths"));
        contentEl.createEl("h2", { text: t("reasoning_paths_title") });
        contentEl
            .createDiv({ cls: c("reasoning-paths-start") })
            .createSpan({ cls: c("reasoning-paths-note"), text: basename(this.start) })
            .setAttribute("title", this.start);

        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") {
            contentEl.createDiv({ cls: c("reasoning-paths-status"), text: t("reasoning_paths_indexing") });
            return;
        }
        const model = index.getModel();
        const paths = reasoningPaths(model, this.start);
        const candidates = proposeReasoningLinks(model, this.start, { limit: 5 });

        if (paths.length === 0 && candidates.length === 0) {
            contentEl.createDiv({ cls: c("reasoning-paths-status"), text: t("reasoning_paths_empty") });
            return;
        }

        if (paths.length > 0) {
            contentEl.createDiv({ cls: c("reasoning-paths-intro"), text: t("reasoning_paths_intro", String(paths.length)) });
            const list = contentEl.createDiv({ cls: c("reasoning-paths-list") });
            for (const path of paths) this.renderPath(list, path);
        }

        if (candidates.length > 0) this.renderExtend(contentEl, candidates);
    }

    /**
     * The next links to consider (#363, D3) — **proposed, never committed**. The role each would play
     * (a reason, a counter, an example, a response) and whether to add it at all stays your verdict;
     * clicking a candidate only opens it. Nothing here writes to the vault.
     */
    private renderExtend(contentEl: HTMLElement, candidates: ReasoningLinkCandidate[]): void {
        contentEl.createEl("h3", { text: t("reasoning_paths_extend_title"), cls: c("reasoning-paths-extend-title") });
        contentEl.createDiv({ cls: c("reasoning-paths-extend-intro"), text: t("reasoning_paths_extend_intro") });
        const list = contentEl.createDiv({ cls: c("reasoning-paths-extend-list") });
        for (const candidate of candidates) {
            const row = list.createDiv({ cls: c("reasoning-paths-extend-item") });
            this.renderNote(row, candidate.path);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private renderPath(list: HTMLElement, path: Path): void {
        const row = list.createDiv({ cls: c("reasoning-paths-path") });
        this.renderNote(row, path.start);
        for (const step of path.steps) {
            const key = REL_LABEL_KEY[step.type];
            row.createSpan({ cls: c("reasoning-paths-rel"), text: key ? t(key) : step.type });
            this.renderNote(row, step.to);
        }
    }

    private renderNote(row: HTMLElement, path: string): void {
        const link = row.createSpan({ cls: c("reasoning-paths-note"), text: basename(path) });
        link.setAttribute("title", path);
        makeActivatable(link, () => {
            void this.app.workspace.openLinkText(path, "", false);
            this.close();
        });
    }
}

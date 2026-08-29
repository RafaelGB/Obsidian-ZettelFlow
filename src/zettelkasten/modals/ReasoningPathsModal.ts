import { c } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { reasoningPaths, type Path } from "architecture/knowledge/state";
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
        const paths = reasoningPaths(index.getModel(), this.start);
        if (paths.length === 0) {
            contentEl.createDiv({ cls: c("reasoning-paths-status"), text: t("reasoning_paths_empty") });
            return;
        }
        contentEl.createDiv({ cls: c("reasoning-paths-intro"), text: t("reasoning_paths_intro", String(paths.length)) });
        const list = contentEl.createDiv({ cls: c("reasoning-paths-list") });
        for (const path of paths) this.renderPath(list, path);
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
        link.addEventListener("click", () => {
            void this.app.workspace.openLinkText(path, "", false);
            this.close();
        });
    }
}

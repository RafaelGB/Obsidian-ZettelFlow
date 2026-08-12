import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { Discovery, findDiscoveries } from "architecture/knowledge/discovery/discoveries";

type ViewState = "computing" | "ready" | "none" | "error";

const LIMIT = 3;

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * The 🔭 morning-discovery pane (#163): surfaces up to three unlinked note pairs that share graph
 * context, each one click from being related. **Accept** writes an `expands` relation from note a to
 * note b via the sanctioned `fileManager.processFrontMatter` (dedup-append); **dismiss** hides the
 * pair for the session. `createEl`/`c()` only — no innerHTML/inline styles.
 */
export class DiscoveriesView extends ItemView {
    static readonly NAME = "zettelflow-discoveries";

    private state: ViewState = "computing";
    private discoveries: Discovery[] = [];
    private readonly dismissed = new Set<string>();

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return DiscoveriesView.NAME;
    }

    getDisplayText(): string {
        return t("discoveries_view_title");
    }

    getIcon(): string {
        return "telescope";
    }

    async onOpen(): Promise<void> {
        this.recompute();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    private key(discovery: Discovery): string {
        return `${discovery.a}::${discovery.b}`;
    }

    private recompute(): void {
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "computing";
                this.render();
                return;
            }
            const ranked = findDiscoveries(index.getModel(), { limit: LIMIT + this.dismissed.size });
            this.discoveries = ranked.filter((d) => !this.dismissed.has(this.key(d))).slice(0, LIMIT);
            this.state = this.discoveries.length === 0 ? "none" : "ready";
        } catch (error) {
            this.state = "error";
            log.error(`[Discoveries] compute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        const container = contentEl.createDiv({ cls: c("discoveries") });

        const header = container.createDiv({ cls: c("discoveries-header") });
        header.createEl("h4", { text: t("discoveries_view_title"), cls: c("discoveries-title") });
        const refresh = header.createEl("button", {
            text: t("discoveries_refresh_button"),
            cls: c("discoveries-refresh"),
            attr: { "aria-label": t("discoveries_refresh_button") },
        });
        this.registerDomEvent(refresh, "click", () => this.recompute());

        if (this.state === "computing") {
            container.createDiv({ cls: c("discoveries-status"), text: t("discoveries_computing") });
            return;
        }
        if (this.state === "error") {
            container.createDiv({ cls: c("discoveries-status"), text: t("discoveries_error") });
            return;
        }
        if (this.state === "none") {
            container.createDiv({ cls: c("discoveries-status"), text: t("discoveries_none") });
            return;
        }

        const list = container.createDiv({ cls: c("discoveries-list") });
        for (const discovery of this.discoveries) this.renderCard(list, discovery);
    }

    private renderCard(list: HTMLElement, discovery: Discovery): void {
        const card = list.createDiv({ cls: c("discoveries-card") });
        const pair = card.createDiv({ cls: c("discoveries-pair") });
        pair.createSpan({ text: basename(discovery.a), cls: c("discoveries-note") });
        pair.createSpan({ text: " · ", cls: c("discoveries-sep") });
        pair.createSpan({ text: basename(discovery.b), cls: c("discoveries-note") });
        card.createDiv({ cls: c("discoveries-prompt"), text: t("discoveries_prompt") });

        const actions = card.createDiv({ cls: c("discoveries-actions") });
        const accept = actions.createEl("button", { text: t("discoveries_accept"), cls: c("discoveries-accept") });
        accept.addClass("mod-cta");
        this.registerDomEvent(accept, "click", () => void this.accept(discovery));
        const dismiss = actions.createEl("button", { text: t("discoveries_dismiss"), cls: c("discoveries-dismiss") });
        this.registerDomEvent(dismiss, "click", () => this.dismiss(discovery));
        const open = actions.createEl("button", { text: t("discoveries_open"), cls: c("discoveries-open") });
        this.registerDomEvent(open, "click", () => void ObsidianApi.workspace().openLinkText(discovery.a, "", false));
    }

    private dismiss(discovery: Discovery): void {
        this.dismissed.add(this.key(discovery));
        this.recompute();
    }

    private async accept(discovery: Discovery): Promise<void> {
        try {
            const file = ObsidianApi.vault().getFileByPath(discovery.a);
            if (!(file instanceof TFile)) {
                new Notice(t("discoveries_accept_error_notice"));
                return;
            }
            const link = `[[${basename(discovery.b)}]]`;
            await ObsidianApi.fileManager().processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                const existing = frontmatter.expands;
                // Add-only, never overwrite a user's existing value (any type is preserved).
                if (Array.isArray(existing)) {
                    if (!existing.includes(link)) existing.push(link);
                } else if (existing === undefined || existing === null || existing === "") {
                    frontmatter.expands = link;
                } else if (existing !== link) {
                    frontmatter.expands = [existing, link];
                }
            });
            new Notice(t("discoveries_accepted_notice"));
            // The model re-indexes asynchronously; dismiss for the session so it can't re-appear now.
            this.dismissed.add(this.key(discovery));
            this.recompute();
        } catch (error) {
            log.error(`[Discoveries] accept failed: ${error instanceof Error ? error.message : "unknown error"}`);
            new Notice(t("discoveries_accept_error_notice"));
        }
    }
}

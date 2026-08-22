import { App, MarkdownView, Notice, TFile } from "obsidian";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { Discovery, findDiscoveries } from "architecture/knowledge/state";
import { ResurfacedNote, rankResurfacedNotes } from "application/notes/resurfaceRanking";
import { buildResurfaceInputs } from "architecture/components/core/resurface/resurfaceInputs";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";

type ViewState = "computing" | "ready" | "none" | "error";

const LIMIT = 3;

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * The **Connections** mode of the Discovery surface (#272, formerly `DiscoveriesView`, #163): up to
 * three unlinked note pairs that share graph context, each one click from being related, plus a
 * "related to the active note" section (#231 Phase 3). Render byte-identical to the old view.
 */
export class DiscoveriesRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "computing";
    private discoveries: Discovery[] = [];
    private readonly dismissed = new Set<string>();
    private related: ResurfacedNote[] = [];
    private relatedActivePath: string | null = null;
    private throttleTimer: number | undefined;

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        this.registerWorkspaceListeners();
        this.refresh();
    }

    onunload(): void {
        window.clearTimeout(this.throttleTimer);
        this.container.empty();
    }

    private registerWorkspaceListeners(): void {
        const throttled = () => {
            window.clearTimeout(this.throttleTimer);
            this.throttleTimer = window.setTimeout(() => this.refresh(), 400);
        };
        this.registerEvent(this.app.workspace.on("active-leaf-change", throttled));
        this.registerEvent(this.app.workspace.on("file-open", throttled));
    }

    private key(discovery: Discovery): string {
        return `${discovery.a}::${discovery.b}`;
    }

    private refresh(): void {
        this.computeDiscoveries();
        this.computeRelated();
        this.render();
    }

    private computeDiscoveries(): void {
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "computing";
                return;
            }
            const ranked = findDiscoveries(index.getModel(), { limit: LIMIT + this.dismissed.size });
            this.discoveries = ranked.filter((d) => !this.dismissed.has(this.key(d))).slice(0, LIMIT);
            this.state = this.discoveries.length === 0 ? "none" : "ready";
        } catch (error) {
            this.state = "error";
            log.error(`[Discoveries] compute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    }

    private computeRelated(): void {
        try {
            const activeFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
            this.relatedActivePath = activeFile?.path ?? null;
            if (!activeFile) {
                this.related = [];
                return;
            }
            const inputs = buildResurfaceInputs(this.app);
            const active = inputs.buildActiveSignals(activeFile);
            this.related = rankResurfacedNotes({
                active,
                candidates: inputs.candidates,
                now: Date.now(),
                excludePaths: [active.path],
            }).slice(0, LIMIT);
        } catch (error) {
            this.related = [];
            log.error(`[Discovery] related compute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    }

    private render(): void {
        const host = this.container;
        host.empty();
        const container = host.createDiv({ cls: c("discoveries") });

        const header = container.createDiv({ cls: c("discoveries-header") });
        header.createEl("h4", { text: t("discovery_view_title"), cls: c("discoveries-title") });
        const refresh = header.createEl("button", {
            text: t("discoveries_refresh_button"),
            cls: c("discoveries-refresh"),
            attr: { "aria-label": t("discoveries_refresh_button") },
        });
        this.registerDomEvent(refresh, "click", () => this.refresh());

        this.renderDiscoveries(container);
        this.renderRelated(container);
    }

    private renderDiscoveries(container: HTMLElement): void {
        container.createEl("h5", { text: t("discoveries_view_title"), cls: c("discoveries-section-heading") });
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

    private renderRelated(container: HTMLElement): void {
        container.createEl("h5", { text: t("resurface_view_title"), cls: c("discoveries-section-heading") });
        if (!this.relatedActivePath) {
            container.createDiv({ cls: c("discoveries-status"), text: t("resurface_no_active") });
            return;
        }
        if (this.related.length === 0) {
            container.createDiv({ cls: c("discoveries-status"), text: t("resurface_no_relations") });
            return;
        }
        const list = container.createDiv({ cls: c("discoveries-list") });
        for (const note of this.related) {
            const card = list.createDiv({ cls: c("discoveries-card") });
            const nameEl = card.createSpan({ text: note.basename, cls: c("discoveries-note") });
            nameEl.setAttribute("title", note.path);
            const actions = card.createDiv({ cls: c("discoveries-actions") });
            const open = actions.createEl("button", { text: t("discoveries_open"), cls: c("discoveries-open") });
            this.registerDomEvent(open, "click", () => void ObsidianApi.workspace().openLinkText(note.path, "", false));
        }
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
        this.refresh();
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
                if (Array.isArray(existing)) {
                    if (!existing.includes(link)) existing.push(link);
                } else if (existing === undefined || existing === null || existing === "") {
                    frontmatter.expands = link;
                } else if (existing !== link) {
                    frontmatter.expands = [existing, link];
                }
            });
            new Notice(t("discoveries_accepted_notice"));
            this.dismissed.add(this.key(discovery));
            this.refresh();
        } catch (error) {
            log.error(`[Discoveries] accept failed: ${error instanceof Error ? error.message : "unknown error"}`);
            new Notice(t("discoveries_accept_error_notice"));
        }
    }
}

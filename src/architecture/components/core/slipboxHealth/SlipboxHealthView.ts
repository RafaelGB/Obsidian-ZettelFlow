import { ItemView, WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { ObsidianApi } from "architecture";
import { classifyHealth, HealthNote, HealthResult } from "./classifyHealth";

const DEBOUNCE_MS = 400;

type ViewState = "indexing" | "ready" | "empty" | "error";

export class SlipboxHealthView extends ItemView {
    static readonly NAME = "zettelflow-slipbox-health";

    private state: ViewState = "indexing";
    private result: HealthResult | null = null;
    private debounceTimer: number | undefined;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return SlipboxHealthView.NAME;
    }

    getDisplayText(): string {
        return t("slipbox_health_view_title");
    }

    getIcon(): string {
        return "stethoscope";
    }

    async onOpen(): Promise<void> {
        this.registerVaultListeners();
        await this.recompute();
    }

    async onClose(): Promise<void> {
        window.clearTimeout(this.debounceTimer);
        this.contentEl.empty();
    }

    private registerVaultListeners(): void {
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => {
                void this.recompute();
            }, DEBOUNCE_MS);
        };
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
    }

    async recompute(): Promise<void> {
        this.state = "indexing";
        this.render();

        try {
            const cache = ObsidianApi.metadataCache();
            const resolved = cache.resolvedLinks;
            const unresolvedLinks = (cache as unknown as { unresolvedLinks: Record<string, Record<string, number>> }).unresolvedLinks ?? {};
            const markdownPaths = this.app.vault.getMarkdownFiles().map((f) => f.path);

            this.result = classifyHealth({ resolvedLinks: resolved, unresolvedLinks, markdownPaths });
            this.state = (this.result.orphans.length === 0 && this.result.deadEnds.length === 0)
                ? "empty"
                : "ready";

            log.debug(
                `[SlipboxHealth] scan done in ${this.result.durationMs}ms — ` +
                `scanned=${this.result.totalScanned}, ` +
                `orphans=${this.result.orphans.length}, ` +
                `dead-ends=${this.result.deadEnds.length}`
            );
        } catch (err) {
            this.state = "error";
            log.error(`[SlipboxHealth] classification failed: ${err}`);
        }

        this.render();
    }

    render(): void {
        const { contentEl } = this;
        contentEl.empty();

        const container = contentEl.createDiv({ cls: c("slipbox-health") });

        // Header
        const header = container.createDiv({ cls: c("slipbox-health-header") });
        header.createEl("h4", { text: t("slipbox_health_view_title"), cls: c("slipbox-health-title") });
        const refreshBtn = header.createEl("button", {
            text: t("slipbox_health_refresh_button"),
            cls: c("slipbox-health-refresh-button"),
            attr: { "aria-label": t("slipbox_health_refresh_button") },
        });
        refreshBtn.addEventListener("click", () => void this.recompute());

        // State rendering
        switch (this.state) {
            case "indexing":
                container.createDiv({ cls: c("slipbox-health-status"), text: t("slipbox_health_indexing") });
                break;
            case "error":
                container.createDiv({ cls: [c("slipbox-health-status"), c("slipbox-health-status--error")].join(" "), text: t("slipbox_health_error") });
                break;
            case "empty":
                container.createDiv({ cls: c("slipbox-health-status"), text: t("slipbox_health_all_connected") });
                break;
            case "ready":
                this.renderResults(container);
                break;
        }
    }

    private renderResults(container: HTMLElement): void {
        if (!this.result) return;
        const { orphans, deadEnds, totalScanned } = this.result;

        // Summary
        const summary = container.createDiv({ cls: c("slipbox-health-summary") });
        summary.createSpan({ text: t("slipbox_health_scanned", String(totalScanned)), cls: c("slipbox-health-summary-total") });
        summary.createSpan({ text: ` · `, cls: c("slipbox-health-summary-sep") });
        summary.createSpan({ text: t("slipbox_health_orphan_count", String(orphans.length)), cls: c("slipbox-health-summary-orphans") });
        summary.createSpan({ text: ` · `, cls: c("slipbox-health-summary-sep") });
        summary.createSpan({ text: t("slipbox_health_deadend_count", String(deadEnds.length)), cls: c("slipbox-health-summary-deadends") });

        if (orphans.length > 0) {
            this.renderSection(container, t("slipbox_health_orphans_heading"), orphans, "slipbox-health-orphan");
        }
        if (deadEnds.length > 0) {
            this.renderSection(container, t("slipbox_health_deadends_heading"), deadEnds, "slipbox-health-deadend");
        }
    }

    private renderSection(container: HTMLElement, heading: string, notes: HealthNote[], itemCls: string): void {
        const section = container.createDiv({ cls: c("slipbox-health-section") });
        section.createEl("h5", { text: heading, cls: c("slipbox-health-section-heading") });
        const list = section.createDiv({ cls: c("slipbox-health-list") });
        for (const note of notes) {
            this.renderNoteRow(list, note, itemCls);
        }
    }

    private renderNoteRow(container: HTMLElement, note: HealthNote, itemCls: string): void {
        const row = container.createDiv({ cls: [c("slipbox-health-item"), c(itemCls)].join(" ") });

        const nameEl = row.createSpan({ text: note.basename, cls: c("slipbox-health-item-name") });
        nameEl.setAttribute("title", note.path);
        nameEl.addEventListener("click", () => {
            void this.app.workspace.openLinkText(note.path, "", false);
        });

        const connectBtn = row.createEl("button", {
            text: t("slipbox_health_connect_now"),
            cls: c("slipbox-health-connect-button"),
            attr: { "aria-label": t("slipbox_health_connect_now") },
        });
        connectBtn.addEventListener("click", () => {
            void this.app.workspace.openLinkText(note.path, "", false);
        });
    }
}

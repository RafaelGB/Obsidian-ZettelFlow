import { ItemView, WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { ConceptualTimeline } from "architecture/plugin/timeline/ConceptualTimeline";
import type { Snapshot } from "architecture/knowledge/state";

const DEBOUNCE_MS = 400;

type ViewState = "loading" | "ready" | "empty" | "disabled" | "error";

/**
 * **Evolution timeline** (#168): the conceptual history of the ACTIVE note — the sequence of its
 * lifecycle state + claim texts captured on meaningful change, oldest→newest. Reads the persisted
 * {@link ConceptualTimeline} snapshots; writes nothing. Auto-updates on note switch / edit via
 * debounced listeners. `createEl`/`c()` only; no innerHTML/inline styles.
 */
export class EvolutionTimelineView extends ItemView {
    static readonly NAME = "zettelflow-evolution-timeline";

    private state: ViewState = "loading";
    private snapshots: Snapshot[] = [];
    private debounceTimer: number | undefined;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return EvolutionTimelineView.NAME;
    }

    getDisplayText(): string {
        return t("evolution_timeline_view_title");
    }

    getIcon(): string {
        return "milestone";
    }

    async onOpen(): Promise<void> {
        this.registerVaultListeners();
        this.recompute();
    }

    async onClose(): Promise<void> {
        window.clearTimeout(this.debounceTimer);
        this.contentEl.empty();
    }

    private registerVaultListeners(): void {
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.recompute(), DEBOUNCE_MS);
        };
        this.registerEvent(this.app.workspace.on("active-leaf-change", debounced));
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
    }

    private recompute(): void {
        try {
            const timeline = ConceptualTimeline.getInstance();
            if (!timeline.enabled()) {
                this.snapshots = [];
                this.state = "disabled";
                this.render();
                return;
            }
            const active = this.app.workspace.getActiveFile();
            this.snapshots = active ? timeline.snapshotsFor(active.path) : [];
            this.state = this.snapshots.length === 0 ? "empty" : "ready";
        } catch (error) {
            this.state = "error";
            log.error(`[EvolutionTimeline] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        const container = contentEl.createDiv({ cls: c("evolution-timeline") });

        const header = container.createDiv({ cls: c("evolution-timeline-header") });
        header.createEl("h4", { text: t("evolution_timeline_view_title"), cls: c("evolution-timeline-title") });
        const refresh = header.createEl("button", {
            text: t("evolution_timeline_refresh_button"),
            cls: c("evolution-timeline-refresh"),
            attr: { "aria-label": t("evolution_timeline_refresh_button") },
        });
        refresh.addEventListener("click", () => this.recompute());

        if (this.state === "loading") {
            container.createDiv({ cls: c("evolution-timeline-status"), text: t("evolution_timeline_loading") });
            return;
        }
        if (this.state === "disabled") {
            container.createDiv({ cls: c("evolution-timeline-status"), text: t("evolution_timeline_disabled") });
            return;
        }
        if (this.state === "error") {
            container.createDiv({ cls: c("evolution-timeline-status"), text: t("evolution_timeline_error") });
            return;
        }
        if (this.state === "empty") {
            container.createDiv({ cls: c("evolution-timeline-status"), text: t("evolution_timeline_empty") });
            return;
        }

        for (const snapshot of this.snapshots) this.renderSnapshot(container, snapshot);
    }

    private renderSnapshot(container: HTMLElement, snapshot: Snapshot): void {
        const entry = container.createDiv({ cls: c("evolution-timeline-entry") });
        entry.createSpan({ text: new Date(snapshot.at).toLocaleDateString(), cls: c("evolution-timeline-date") });

        const stateLine = entry.createDiv({ cls: c("evolution-timeline-line") });
        stateLine.createSpan({ text: t("evolution_timeline_state_label"), cls: c("evolution-timeline-label") });
        stateLine.createSpan({ text: snapshot.state, cls: c("evolution-timeline-state") });

        if (snapshot.claims.length === 0) return;
        const claimsLine = entry.createDiv({ cls: c("evolution-timeline-line") });
        claimsLine.createSpan({ text: t("evolution_timeline_claims_label"), cls: c("evolution-timeline-label") });
        const list = claimsLine.createDiv({ cls: c("evolution-timeline-claims") });
        for (const claim of snapshot.claims) list.createDiv({ text: claim, cls: c("evolution-timeline-claim") });
    }
}

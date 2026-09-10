import { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { ConceptualTimeline } from "architecture/plugin/timeline/ConceptualTimeline";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    timelineEvents,
    judgementsFor,
    buildIdeaCard,
    trajectory,
    type Snapshot,
    type TimelineEvent,
    type Judgement,
} from "architecture/knowledge/state";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { paintIdeaCard } from "./IdeaCardCanvas";
import { canvasToPngBlob } from "architecture/components/core/export/mediaCapture";
import { buildExportBaseName } from "architecture/components/core/export/exportFilename";
import { ExportShareModal } from "architecture/components/core/export/ExportShareModal";

const DEBOUNCE_MS = 400;

type ViewState = "loading" | "ready" | "empty" | "disabled" | "error";

/**
 * The **Timeline** mode of the Health surface (#272, formerly `EvolutionTimelineView`, #168): the
 * conceptual history of the ACTIVE note — its lifecycle state + claim texts captured on meaningful
 * change, oldest→newest. Reads persisted {@link ConceptualTimeline} snapshots; writes nothing.
 * Auto-updates on note switch / edit via debounced listeners. Render byte-identical to the old view.
 */
export class EvolutionTimelineRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "loading";
    private events: TimelineEvent[] = [];
    /** Show only the cognitive milestones (judgements), hiding the structural snapshots (#362, D2). */
    private cognitiveOnly = false;
    private debounceTimer: number | undefined;

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        this.registerVaultListeners();
        this.recompute();
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        this.container.empty();
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
                this.events = [];
                this.state = "disabled";
                this.render();
                return;
            }
            const active = this.app.workspace.getActiveFile();
            const snapshots = active ? timeline.snapshotsFor(active.path) : [];
            // The judgement log is scope-filtered and path-exact; an idea with no verdicts adds nothing,
            // so a note that was never ruled on renders exactly the pre-#362 timeline.
            const judgements = active ? judgementsFor(JudgementLog.getInstance().entries(), active.path) : [];
            this.events = timelineEvents(snapshots, judgements);
            this.state = this.events.length === 0 ? "empty" : "ready";
        } catch (error) {
            this.state = "error";
            log.error(`[EvolutionTimeline] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const root = this.container;
        root.empty();
        const container = root.createDiv({ cls: c("evolution-timeline") });

        const header = container.createDiv({ cls: c("evolution-timeline-header") });
        header.createEl("h4", { text: t("evolution_timeline_view_title"), cls: c("evolution-timeline-title") });
        const refresh = header.createEl("button", {
            text: t("evolution_timeline_refresh_button"),
            cls: c("evolution-timeline-refresh"),
            attr: { "aria-label": t("evolution_timeline_refresh_button") },
        });
        this.registerDomEvent(refresh, "click", () => this.recompute());

        // The filter appears only once there is a cognitive milestone to isolate, so a snapshots-only
        // note keeps the pre-#362 header.
        if (this.state === "ready" && this.events.some((event) => event.kind === "judgement")) {
            const filter = header.createEl("button", {
                text: this.cognitiveOnly ? t("evolution_timeline_filter_all") : t("evolution_timeline_filter_cognitive"),
                cls: c("evolution-timeline-filter"),
            });
            this.registerDomEvent(filter, "click", () => {
                this.cognitiveOnly = !this.cognitiveOnly;
                this.render();
            });
        }

        // Share this idea's evolution as an image card (#387, B4) — only when there's history to show.
        if (this.state === "ready") {
            const share = header.createEl("button", {
                text: t("evolution_timeline_share_button"),
                cls: c("evolution-timeline-share"),
                attr: { "aria-label": t("evolution_timeline_share_button") },
            });
            this.registerDomEvent(share, "click", () => void this.shareIdeaCard());
        }

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

        const events = this.cognitiveOnly ? this.events.filter((event) => event.kind === "judgement") : this.events;
        for (const event of events) {
            if (event.kind === "snapshot" && event.snapshot) this.renderSnapshot(container, event.snapshot);
            else if (event.kind === "judgement" && event.judgement) this.renderJudgement(container, event.judgement);
        }
    }

    /**
     * Build the before→after idea card for the active note and open A3's export dialog (#387, B4).
     * Read-only: composes shipped data (timeline + judgements + current degree) into a canvas image;
     * writes nothing to the note or the vault until the user chooses to save from the dialog.
     */
    private async shareIdeaCard(): Promise<void> {
        try {
            const active = this.app.workspace.getActiveFile();
            if (!active) return;
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") return;
            const model = index.getModel();
            const linksNow = model.get(active.path)?.maturitySignals.degree ?? 0;
            const history = JudgementLog.getInstance().entries();
            const direction = trajectory(model, history, Date.now()).find((row) => row.path === active.path)?.direction ?? null;

            const card = buildIdeaCard({ path: active.path, events: this.events, linksNow, direction });
            if (!card) return;

            const canvas = createEl("canvas");
            paintIdeaCard(canvas, card);
            const blob = await canvasToPngBlob(canvas);
            new ExportShareModal(this.app, { blob, baseName: buildExportBaseName("idea", new Date(), card.title), kind: "image" }).open();
        } catch (error) {
            log.error(`[EvolutionTimeline] share failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    }

    /** A cognitive milestone (#362, D2): the verdict, its confidence, and the rationale on hover. */
    private renderJudgement(container: HTMLElement, judgement: Judgement): void {
        const entry = container.createDiv({ cls: [c("evolution-timeline-entry"), c("evolution-timeline-judgement")] });
        entry.createSpan({ text: new Date(judgement.at).toLocaleDateString(), cls: c("evolution-timeline-date") });

        const line = entry.createDiv({ cls: c("evolution-timeline-line") });
        line.createSpan({ text: t("evolution_timeline_judgement_label"), cls: c("evolution-timeline-label") });
        line.createSpan({
            text: t(`judgement_verdict_${judgement.verdict}` as Parameters<typeof t>[0]),
            cls: c("evolution-timeline-verdict"),
        });
        if (judgement.confidence) {
            line.createSpan({
                text: t(`confidence_${judgement.confidence}` as Parameters<typeof t>[0]),
                cls: c("evolution-timeline-confidence"),
            });
        }
        if (judgement.note) {
            const noteLine = entry.createDiv({ cls: c("evolution-timeline-line") });
            noteLine.createSpan({ text: judgement.note, cls: c("evolution-timeline-note"), attr: { title: judgement.note } });
        }
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

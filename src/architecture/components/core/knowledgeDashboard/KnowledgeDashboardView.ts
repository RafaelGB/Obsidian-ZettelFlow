import { ItemView, WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    DashboardModel,
    DashboardPanel,
    Metric,
    RecommendationToken,
    buildKnowledgeDashboard,
} from "architecture/knowledge/state";
import { SlipboxHealthView } from "architecture/components/core/slipboxHealth/SlipboxHealthView";
import { OpenQuestionsView } from "architecture/components/core/openQuestions/OpenQuestionsView";
import { EvidenceMapView } from "architecture/components/core/evidenceMap/EvidenceMapView";
import { DiscoveriesView } from "architecture/components/core/discoveries/DiscoveriesView";

const DEBOUNCE_MS = 400;

type ViewState = "indexing" | "ready" | "empty" | "error";
type LocaleKey = Parameters<typeof t>[0];

/** Each recommendation opens the surface where the user acts on it. Exhaustive by the Record type (AC-6). */
const RECOMMENDATION_TARGETS: Record<RecommendationToken, string> = {
    "connect-orphans": SlipboxHealthView.NAME,
    "all-connected": SlipboxHealthView.NAME,
    "reduce-debt": SlipboxHealthView.NAME,
    "debt-clear": SlipboxHealthView.NAME,
    "process-ideas": SlipboxHealthView.NAME,
    "resolve-contradictions": EvidenceMapView.NAME,
    "answer-questions": OpenQuestionsView.NAME,
    "make-connections": DiscoveriesView.NAME,
    "all-clear": OpenQuestionsView.NAME,
};

const RECOMMENDATION_LABELS: Record<RecommendationToken, LocaleKey> = {
    "connect-orphans": "knowledge_dashboard_rec_connect_orphans",
    "all-connected": "knowledge_dashboard_rec_all_connected",
    "reduce-debt": "knowledge_dashboard_rec_reduce_debt",
    "debt-clear": "knowledge_dashboard_rec_debt_clear",
    "resolve-contradictions": "knowledge_dashboard_rec_resolve_contradictions",
    "answer-questions": "knowledge_dashboard_rec_answer_questions",
    "process-ideas": "knowledge_dashboard_rec_process_ideas",
    "make-connections": "knowledge_dashboard_rec_make_connections",
    "all-clear": "knowledge_dashboard_rec_all_clear",
};

const PANEL_LABELS: Record<DashboardPanel["key"], LocaleKey> = {
    connectivity: "knowledge_dashboard_panel_connectivity",
    debt: "knowledge_dashboard_panel_debt",
    today: "knowledge_dashboard_panel_today",
};

const METRIC_LABELS: Record<string, LocaleKey> = {
    connected: "knowledge_dashboard_metric_connected",
    orphaned: "knowledge_dashboard_metric_orphaned",
    unresolved: "knowledge_dashboard_metric_unresolved",
    score: "knowledge_dashboard_metric_score",
    process: "knowledge_dashboard_metric_process",
    contradictions: "knowledge_dashboard_metric_contradictions",
    connections: "knowledge_dashboard_metric_connections",
    questions: "knowledge_dashboard_metric_questions",
};

const BAND_LABELS: Record<string, LocaleKey> = {
    low: "knowledge_dashboard_band_low",
    medium: "knowledge_dashboard_band_medium",
    high: "knowledge_dashboard_band_high",
};

/** The "all good" recommendations — shown as plain, non-navigating text (nothing to act on). */
const POSITIVE_TOKENS: ReadonlySet<RecommendationToken> = new Set(["all-connected", "debt-clear", "all-clear"]);

/**
 * **Knowledge dashboard** (#171): the *state of your knowledge system* as an ops console — three
 * panels (connectivity · knowledge debt · today), each with metrics and a **recommended next action**
 * that opens the surface to act on it. Reads live from the model (AC-1); writes nothing.
 * `createEl`/`c()` only, no innerHTML/inline styles.
 */
export class KnowledgeDashboardView extends ItemView {
    static readonly NAME = "zettelflow-knowledge-dashboard";

    private state: ViewState = "indexing";
    private dashboard: DashboardModel | null = null;
    private debounceTimer: number | undefined;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return KnowledgeDashboardView.NAME;
    }

    getDisplayText(): string {
        return t("knowledge_dashboard_view_title");
    }

    getIcon(): string {
        return "layout-dashboard";
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
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
    }

    private recompute(): void {
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "indexing";
                this.dashboard = null;
                this.render();
                return;
            }
            const start = Date.now();
            const model = index.getModel();
            this.dashboard = buildKnowledgeDashboard(model);
            this.state = model.size() === 0 ? "empty" : "ready";
            log.debug(`[KnowledgeDashboard] ${this.dashboard.panels.length} panels in ${Date.now() - start}ms`);
        } catch (error) {
            this.state = "error";
            log.error(`[KnowledgeDashboard] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        const container = contentEl.createDiv({ cls: c("knowledge-dashboard") });

        const header = container.createDiv({ cls: c("knowledge-dashboard-header") });
        header.createEl("h4", { text: t("knowledge_dashboard_view_title"), cls: c("knowledge-dashboard-title") });
        const refresh = header.createEl("button", {
            text: t("knowledge_dashboard_refresh_button"),
            cls: c("knowledge-dashboard-refresh"),
            attr: { "aria-label": t("knowledge_dashboard_refresh_button") },
        });
        refresh.addEventListener("click", () => this.recompute());

        if (this.state === "indexing") {
            container.createDiv({ cls: c("knowledge-dashboard-status"), text: t("knowledge_dashboard_indexing") });
            return;
        }
        if (this.state === "error") {
            container.createDiv({ cls: c("knowledge-dashboard-status"), text: t("knowledge_dashboard_error") });
            return;
        }
        if (this.state === "empty" || !this.dashboard) {
            container.createDiv({ cls: c("knowledge-dashboard-status"), text: t("knowledge_dashboard_empty") });
            return;
        }

        for (const panel of this.dashboard.panels) this.renderPanel(container, panel);
    }

    private renderPanel(container: HTMLElement, panel: DashboardPanel): void {
        const section = container.createDiv({ cls: c("knowledge-dashboard-panel") });
        section.createEl("h5", { text: t(PANEL_LABELS[panel.key]), cls: c("knowledge-dashboard-panel-title") });

        const metrics = section.createDiv({ cls: c("knowledge-dashboard-metrics") });
        for (const metric of panel.metrics) this.renderMetric(metrics, metric);

        const rec = panel.recommendation;
        const row = section.createDiv({ cls: c("knowledge-dashboard-recommendation") });
        const text = t(RECOMMENDATION_LABELS[rec.token], String(rec.count));
        if (POSITIVE_TOKENS.has(rec.token)) {
            row.createSpan({ text, cls: c("knowledge-dashboard-rec-clear") });
            return;
        }
        const label = row.createSpan({ text, cls: c("knowledge-dashboard-rec-label") });
        label.addEventListener("click", () => void activateSidebarView(this.app, RECOMMENDATION_TARGETS[rec.token]));
    }

    private renderMetric(container: HTMLElement, metric: Metric): void {
        const row = container.createDiv({ cls: c("knowledge-dashboard-metric") });
        row.createSpan({ text: t(METRIC_LABELS[metric.key] ?? "knowledge_dashboard_metric_score"), cls: c("knowledge-dashboard-metric-label") });
        const value = metric.percent !== undefined ? `${metric.count} (${metric.percent}%)` : String(metric.count);
        row.createSpan({ text: value, cls: c("knowledge-dashboard-metric-value") });
        if (metric.band) {
            row.createDiv({ cls: [c("knowledge-dashboard-bar"), c(`knowledge-dashboard-bar--${metric.band}`)] });
            row.createSpan({ text: t(BAND_LABELS[metric.band] ?? "knowledge_dashboard_band_low"), cls: c("knowledge-dashboard-band") });
        }
    }
}

import { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { activateSurface } from "architecture/plugin";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    DashboardModel,
    DashboardPanel,
    Metric,
    RecommendationToken,
    buildKnowledgeDashboard,
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import type { SurfaceTarget } from "architecture/components/core/surface/legacyTargets";

const DEBOUNCE_MS = 400;

type ViewState = "indexing" | "ready" | "empty" | "error";
type LocaleKey = Parameters<typeof t>[0];

/** Each recommendation opens the surface + mode where the user acts on it (#272). */
const RECOMMENDATION_TARGETS: Record<RecommendationToken, SurfaceTarget> = {
    "connect-orphans": { surface: "zettelflow-health", mode: "health" },
    "all-connected": { surface: "zettelflow-health", mode: "health" },
    "reduce-debt": { surface: "zettelflow-health", mode: "health" },
    "debt-clear": { surface: "zettelflow-health", mode: "health" },
    "process-ideas": { surface: "zettelflow-health", mode: "health" },
    "resolve-contradictions": { surface: "zettelflow-discovery", mode: "challenges" },
    "answer-questions": { surface: "zettelflow-discovery", mode: "questions" },
    "make-connections": { surface: "zettelflow-discovery", mode: "connections" },
    "all-clear": { surface: "zettelflow-discovery", mode: "questions" },
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
 * The **Dashboard** mode of the Health surface (#272, formerly `KnowledgeDashboardView`, #171): the
 * state of your knowledge system as an ops console — three panels (connectivity · debt · today), each
 * with metrics and a next-action that opens the surface + mode to act on it. Reads live; writes
 * nothing. Render byte-identical to the old view.
 */
export class KnowledgeDashboardRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private dashboard: DashboardModel | null = null;
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
        const host = this.container;
        host.empty();
        const container = host.createDiv({ cls: c("knowledge-dashboard") });

        const header = container.createDiv({ cls: c("knowledge-dashboard-header") });
        header.createEl("h4", { text: t("knowledge_dashboard_view_title"), cls: c("knowledge-dashboard-title") });
        const refresh = header.createEl("button", {
            text: t("knowledge_dashboard_refresh_button"),
            cls: c("knowledge-dashboard-refresh"),
            attr: { "aria-label": t("knowledge_dashboard_refresh_button") },
        });
        this.registerDomEvent(refresh, "click", () => this.recompute());

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
        const target = RECOMMENDATION_TARGETS[rec.token];
        this.registerDomEvent(label, "click", () => void activateSurface(this.app, target.surface, target.mode));
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

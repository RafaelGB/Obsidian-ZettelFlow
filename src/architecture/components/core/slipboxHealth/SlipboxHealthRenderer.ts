import { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { activateSurface } from "architecture/plugin";
import { KnowledgeIndex } from "architecture/knowledge";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import {
    computeKnowledgeDebt,
    severityBucket,
    DebtCategory,
    DebtCategoryKey,
    KnowledgeDebt,
    computeKnowledgeBalance,
    CompositionBucket,
    BalanceSuggestion,
    KnowledgeBalance,
    classifyHealth,
    HealthNote,
    HealthResult,
    buildKnowledgeDashboard,
    DashboardModel,
    unexaminedIdeas,
    UnexaminedIdea,
    DashboardPanel,
    Metric,
    RecommendationToken,
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import type { SurfaceTarget } from "architecture/components/core/surface/legacyTargets";

const DEBOUNCE_MS = 400;
/** Cap the DOM rows per health section (#302 S5): a huge vault can have thousands of orphans. */
const MAX_HEALTH_ROWS = 200;

type LocaleKey = Parameters<typeof t>[0];

// ── system panels (#314): the connectivity + "today" panels, merged in from the retired Dashboard ──
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
    process: "knowledge_dashboard_metric_process",
    contradictions: "knowledge_dashboard_metric_contradictions",
    connections: "knowledge_dashboard_metric_connections",
    questions: "knowledge_dashboard_metric_questions",
};
/** The "all good" recommendations — shown as plain, non-navigating text. */
const POSITIVE_TOKENS: ReadonlySet<RecommendationToken> = new Set(["all-connected", "debt-clear", "all-clear"]);

/** Self-describing debt-category labels/descriptions (#159, avoids the older orphan/dead-end wording). */
const DEBT_LABELS: Record<DebtCategoryKey, LocaleKey> = {
    unreferenced: "knowledge_debt_unreferenced_label",
    dangling: "knowledge_debt_dangling_label",
    unsourced: "knowledge_debt_unsourced_label",
    "open-question": "knowledge_debt_open_question_label",
};
const DEBT_DESCS: Record<DebtCategoryKey, LocaleKey> = {
    unreferenced: "knowledge_debt_unreferenced_desc",
    dangling: "knowledge_debt_dangling_desc",
    unsourced: "knowledge_debt_unsourced_desc",
    "open-question": "knowledge_debt_open_question_desc",
};

/** Composition-bucket labels + balance-suggestion lines (#161). */
const BALANCE_LABELS: Record<CompositionBucket, LocaleKey> = {
    reference: "knowledge_balance_reference_label",
    question: "knowledge_balance_question_label",
    example: "knowledge_balance_example_label",
    conclusion: "knowledge_balance_conclusion_label",
    concept: "knowledge_balance_concept_label",
};
const BALANCE_SUGGESTIONS: Record<BalanceSuggestion, LocaleKey> = {
    "add-sources": "knowledge_balance_suggest_add_sources",
    "add-examples": "knowledge_balance_suggest_add_examples",
    "ask-questions": "knowledge_balance_suggest_ask_questions",
};

type ViewState = "indexing" | "ready" | "empty" | "error";

/**
 * The **Health** mode of the Health surface — the single home for the state of your knowledge system
 * (#314, merging in the retired Dashboard): the connectivity + "today" panels, the #159 Knowledge Debt
 * score with one-click fixes, the #161 Knowledge balance read-out, and the orphan/dead-end lists.
 * Reads live; writes nothing. Debounced auto-refresh on vault change.
 */
export class SlipboxHealthRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private result: HealthResult | null = null;
    private lastRevision = -1;
    private debt: KnowledgeDebt | null = null;
    private balance: KnowledgeBalance | null = null;
    private dashboard: DashboardModel | null = null;
    /** Ideas that grew structurally with no verdict on them (#339). */
    private unexamined: UnexaminedIdea[] = [];
    private debounceTimer: number | undefined;

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        this.registerVaultListeners();
        void this.recompute();
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        this.container.empty();
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

    recompute(force = false): void {
        try {
            const index = KnowledgeIndex.getInstance();
            // Health, debt and balance all read the same model — wait until it is built (no fallback).
            if (index.status !== "ready") {
                this.state = "indexing";
                this.result = null;
                this.debt = null;
                this.balance = null;
                this.dashboard = null;
                this.unexamined = [];
                this.render();
                return;
            }

            const model = index.getModel();
            // Nothing changed since the last scan — skip classify/debt/balance (#302 S1).
            const revision = model.revision();
            if (!force && this.result && (this.state === "ready" || this.state === "empty") && revision === this.lastRevision) {
                return;
            }
            this.lastRevision = revision;
            this.result = classifyHealth(model);
            this.state = (this.result.orphans.length === 0 && this.result.deadEnds.length === 0)
                ? "empty"
                : "ready";
            this.debt = computeKnowledgeDebt(model);
            this.balance = computeKnowledgeBalance(model);
            this.dashboard = buildKnowledgeDashboard(model);
            this.unexamined = unexaminedIdeas(model, JudgementLog.getInstance().entries(), { limit: 5 });

            log.debug(
                `[SlipboxHealth] scan done in ${this.result.durationMs}ms — ` +
                `scanned=${this.result.totalScanned}, ` +
                `orphans=${this.result.orphans.length}, ` +
                `dead-ends=${this.result.deadEnds.length}, ` +
                `debt=${this.debt.score}, ` +
                `balance=${this.balance.total}`
            );
        } catch (err) {
            this.state = "error";
            log.error(`[SlipboxHealth] classification failed: ${err}`);
        }

        this.render();
    }

    render(): void {
        const host = this.container;
        host.empty();

        const container = host.createDiv({ cls: c("slipbox-health") });

        // Header
        const header = container.createDiv({ cls: c("slipbox-health-header") });
        header.createEl("h4", { text: t("slipbox_health_view_title"), cls: c("slipbox-health-title") });
        const refreshBtn = header.createEl("button", {
            text: t("slipbox_health_refresh_button"),
            cls: c("slipbox-health-refresh-button"),
            attr: { "aria-label": t("slipbox_health_refresh_button") },
        });
        this.registerDomEvent(refreshBtn, "click", () => void this.recompute(true));

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
                this.renderSystemPanels(container);
                this.renderDebtSection(container);
                this.renderBalanceSection(container);
                break;
            case "ready":
                this.renderSummary(container);
                this.renderSystemPanels(container);
                this.renderDebtSection(container);
                this.renderBalanceSection(container);
                this.renderAgencySection(container);
                this.renderLists(container);
                break;
        }
    }

    /** Connectivity + "today" panels (#314): the ops-console overview, merged in from the Dashboard.
     *  Debt is rendered by the richer drill-down section below, so its panel is skipped here. */
    private renderSystemPanels(container: HTMLElement): void {
        if (!this.dashboard) return;
        for (const panel of this.dashboard.panels) {
            if (panel.key === "debt") continue;
            this.renderPanel(container, panel);
        }
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
    }

    private renderBalanceSection(container: HTMLElement): void {
        if (!this.balance || this.balance.total === 0) return;
        const section = container.createDiv({ cls: c("knowledge-balance") });
        section.createEl("h5", { text: t("knowledge_balance_heading"), cls: c("knowledge-balance-heading") });

        const list = section.createDiv({ cls: c("knowledge-balance-list") });
        for (const bucket of this.balance.buckets) {
            const row = list.createDiv({ cls: c("knowledge-balance-row") });
            row.createSpan({ text: t(BALANCE_LABELS[bucket.key]), cls: c("knowledge-balance-label") });
            row.createSpan({ text: `${bucket.count} (${bucket.percent}%)`, cls: c("knowledge-balance-value") });
        }

        if (this.balance.suggestions.length === 0) {
            section.createDiv({ cls: c("knowledge-balance-note"), text: t("knowledge_balance_balanced") });
            return;
        }
        for (const suggestion of this.balance.suggestions) {
            section.createDiv({ cls: c("knowledge-balance-suggestion"), text: t(BALANCE_SUGGESTIONS[suggestion]) });
        }
    }

    private renderDebtSection(container: HTMLElement): void {
        if (!this.debt) return;
        const section = container.createDiv({ cls: c("knowledge-debt") });
        section.createEl("h5", { text: t("knowledge_debt_heading"), cls: c("knowledge-debt-heading") });
        section.createDiv({ cls: c("knowledge-debt-score"), text: t("knowledge_debt_score", String(this.debt.score)) });

        const bar = section.createDiv({ cls: c("knowledge-debt-bar") });
        bar.createDiv({
            cls: [c("knowledge-debt-bar-fill"), c(`knowledge-debt-bar-fill--${severityBucket(this.debt.score)}`)].join(" "),
        });

        if (this.debt.categories.every((category) => category.count === 0)) {
            section.createDiv({ cls: c("knowledge-debt-clean"), text: t("knowledge_debt_clean") });
            return;
        }

        for (const category of this.debt.categories) {
            if (category.count > 0) this.renderDebtCategory(section, category);
        }
    }

    private renderDebtCategory(section: HTMLElement, category: DebtCategory): void {
        const block = section.createDiv({ cls: c("knowledge-debt-category") });
        block.createEl("h6", {
            text: `${t(DEBT_LABELS[category.key])} · ${t("knowledge_debt_count", String(category.count))}`,
            cls: c("knowledge-debt-category-heading"),
        });
        block.createDiv({ cls: c("knowledge-debt-category-desc"), text: t(DEBT_DESCS[category.key]) });
        const list = block.createDiv({ cls: c("knowledge-debt-list") });
        for (const path of category.paths) this.renderDebtRow(list, path);
    }

    private renderDebtRow(list: HTMLElement, path: string): void {
        const row = list.createDiv({ cls: c("knowledge-debt-item") });
        const basename = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
        const nameEl = row.createSpan({ text: basename, cls: c("knowledge-debt-item-name") });
        nameEl.setAttribute("title", path);
        this.registerDomEvent(nameEl, "click", () => {
            void this.app.workspace.openLinkText(path, "", false);
        });
        const openBtn = row.createEl("button", {
            text: t("slipbox_health_connect_now"),
            cls: c("knowledge-debt-open-button"),
            attr: { "aria-label": t("slipbox_health_connect_now") },
        });
        this.registerDomEvent(openBtn, "click", () => {
            void this.app.workspace.openLinkText(path, "", false);
        });
    }

    private renderSummary(container: HTMLElement): void {
        if (!this.result) return;
        const { orphans, deadEnds, totalScanned } = this.result;
        const summary = container.createDiv({ cls: c("slipbox-health-summary") });
        summary.createSpan({ text: t("slipbox_health_scanned", String(totalScanned)), cls: c("slipbox-health-summary-total") });
        summary.createSpan({ text: ` · `, cls: c("slipbox-health-summary-sep") });
        summary.createSpan({ text: t("slipbox_health_orphan_count", String(orphans.length)), cls: c("slipbox-health-summary-orphans") });
        summary.createSpan({ text: ` · `, cls: c("slipbox-health-summary-sep") });
        summary.createSpan({ text: t("slipbox_health_deadend_count", String(deadEnds.length)), cls: c("slipbox-health-summary-deadends") });
    }

    private renderLists(container: HTMLElement): void {
        if (!this.result) return;
        const { orphans, deadEnds } = this.result;
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
        const shown = notes.slice(0, MAX_HEALTH_ROWS);
        for (const note of shown) {
            this.renderNoteRow(list, note, itemCls);
        }
        if (notes.length > shown.length) {
            section.createDiv({
                cls: c("slipbox-health-more"),
                text: t("slipbox_health_more", String(notes.length - shown.length)),
            });
        }
    }

    /**
     * **Cognitive agency** (#339): the ideas that grew without your judgement. It names *ideas* and
     * invites a move — there is no score, no ratio and no grade, because the question is whether your
     * understanding changed, never how much you did.
     */
    private renderAgencySection(container: HTMLElement): void {
        if (this.unexamined.length === 0) return; // nothing to say is better than an empty scoreboard
        const section = container.createDiv({ cls: c("slipbox-health-section") });
        section.createEl("h5", { text: t("agency_heading"), cls: c("slipbox-health-section-heading") });
        section.createDiv({ cls: c("slipbox-health-section-intro"), text: t("agency_intro") });

        const list = section.createDiv({ cls: c("slipbox-health-list") });
        for (const entry of this.unexamined) {
            const row = list.createDiv({ cls: [c("slipbox-health-item"), c("slipbox-health-item--agency")].join(" ") });
            const name = row.createSpan({
                text: (entry.path.split("/").pop() ?? entry.path).replace(/.md$/i, ""),
                cls: c("slipbox-health-item-name"),
            });
            name.setAttribute("title", entry.path);
            this.registerDomEvent(name, "click", () => {
                void this.app.workspace.openLinkText(entry.path, "", false);
            });
        }
    }

    private renderNoteRow(container: HTMLElement, note: HealthNote, itemCls: string): void {
        const row = container.createDiv({ cls: [c("slipbox-health-item"), c(itemCls)].join(" ") });

        const nameEl = row.createSpan({ text: note.basename, cls: c("slipbox-health-item-name") });
        nameEl.setAttribute("title", note.path);
        this.registerDomEvent(nameEl, "click", () => {
            void this.app.workspace.openLinkText(note.path, "", false);
        });

        const connectBtn = row.createEl("button", {
            text: t("slipbox_health_connect_now"),
            cls: c("slipbox-health-connect-button"),
            attr: { "aria-label": t("slipbox_health_connect_now") },
        });
        this.registerDomEvent(connectBtn, "click", () => {
            void this.app.workspace.openLinkText(note.path, "", false);
        });
    }
}

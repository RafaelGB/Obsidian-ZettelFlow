import { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { ObsidianApi } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
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
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";

const DEBOUNCE_MS = 400;

type LocaleKey = Parameters<typeof t>[0];

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
 * The **Health** mode of the Health surface (#272, formerly `SlipboxHealthView`): orphan/dead-end
 * scan + the #159 Knowledge Debt score with one-click fixes + the #161 Knowledge balance read-out.
 * Render byte-identical to the old view; only the `ItemView` shell was dropped so it mounts inside the
 * surface. Debounced auto-refresh on vault change.
 */
export class SlipboxHealthRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private result: HealthResult | null = null;
    private debt: KnowledgeDebt | null = null;
    private balance: KnowledgeBalance | null = null;
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

            const index = KnowledgeIndex.getInstance();
            if (index.status === "ready") {
                const model = index.getModel();
                this.debt = computeKnowledgeDebt(model);
                this.balance = computeKnowledgeBalance(model);
            } else {
                this.debt = null;
                this.balance = null;
            }

            log.debug(
                `[SlipboxHealth] scan done in ${this.result.durationMs}ms — ` +
                `scanned=${this.result.totalScanned}, ` +
                `orphans=${this.result.orphans.length}, ` +
                `dead-ends=${this.result.deadEnds.length}, ` +
                `debt=${this.debt ? this.debt.score : "n/a"}, ` +
                `balance=${this.balance ? this.balance.total : "n/a"}`
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
        this.registerDomEvent(refreshBtn, "click", () => void this.recompute());

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
                this.renderDebtSection(container);
                this.renderBalanceSection(container);
                break;
            case "ready":
                this.renderResults(container);
                this.renderDebtSection(container);
                this.renderBalanceSection(container);
                break;
        }
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

    private renderResults(container: HTMLElement): void {
        if (!this.result) return;
        const { orphans, deadEnds, totalScanned } = this.result;

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

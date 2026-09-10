import { App } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { makeActivatable } from "architecture/components/core/a11y";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import {
    agencyReviewModel,
    type AgencyReviewModel,
    type AgencyReviewRow,
    type AgencyReading,
} from "architecture/knowledge/state";

type LocaleKey = Parameters<typeof t>[0];
const DEBOUNCE_MS = 400;

const READING_KEYS: Record<AgencyReading, LocaleKey> = {
    deciding: "agency_review_reading_deciding",
    mixed: "agency_review_reading_mixed",
    accepting: "agency_review_reading_accepting",
    unknown: "agency_review_reading_unknown",
};
const ORIGIN_KEYS: Record<string, LocaleKey> = {
    ai: "judgement_origin_ai",
    derived: "judgement_origin_derived",
    human: "judgement_origin_human",
};
const VERDICT_KEYS: Record<string, LocaleKey> = {
    accepted: "judgement_verdict_accepted",
    modified: "judgement_verdict_modified",
    rejected: "judgement_verdict_rejected",
    confirmed: "judgement_verdict_confirmed",
    challenged: "judgement_verdict_challenged",
};

/**
 * The **Agency review** mode (#389, C6) — a read-only tab on the Health surface that lists your recorded
 * decisions newest-first with a compact agency header (the cognitive agency index + accept/modify/reject
 * breakdown and a plain-language reading, all from C5). Local and offline: it only reads the
 * {@link JudgementLog} and opens notes; nothing is written back, nothing is transmitted. The header is a
 * *description of your verdict mix, never a score of you* (§XII).
 */
export class AgencyReviewRenderer extends KnowledgeModeRenderer {
    private debounce: number | undefined;

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        // Cheap refresh if the vault reindexes while the tab is open; re-mounting on tab switch covers the rest.
        this.registerEvent(this.app.metadataCache.on("resolved", () => this.scheduleRender()));
        this.render();
    }

    onunload(): void {
        window.clearTimeout(this.debounce);
        this.container.empty();
    }

    private scheduleRender(): void {
        window.clearTimeout(this.debounce);
        this.debounce = window.setTimeout(() => this.render(), DEBOUNCE_MS);
    }

    private render(): void {
        this.container.empty();
        const root = this.container.createDiv({ cls: c("agency-review") });
        const log = JudgementLog.getInstance();

        if (!log.enabled()) {
            root.createDiv({ cls: c("agency-review-message"), text: t("agency_review_disabled") });
            return;
        }

        const model = agencyReviewModel(log.entries());
        root.createEl("h3", { cls: c("agency-review-title"), text: t("agency_review_title") });
        this.renderHeader(root, model);

        if (model.rows.length === 0) {
            root.createDiv({ cls: c("agency-review-message"), text: t("agency_review_empty") });
            return;
        }
        this.renderRows(root, model.rows);
    }

    private renderHeader(root: HTMLElement, model: AgencyReviewModel): void {
        const header = root.createDiv({ cls: c("agency-review-header") });
        const index = model.header.index;

        const indexRow = header.createDiv({ cls: c("agency-review-index") });
        indexRow.createSpan({ cls: c("agency-review-index-label"), text: t("agency_review_index_label") });
        indexRow.createSpan({
            cls: c("agency-review-index-value"),
            text: index === null ? "—" : `${Math.round(index * 100)}%`,
        });

        header.createDiv({
            cls: c("agency-review-breakdown"),
            text: t(
                "agency_review_breakdown",
                String(model.header.accepted),
                String(model.header.modified),
                String(model.header.rejected)
            ),
        });
        header.createDiv({ cls: c("agency-review-reading"), text: t(READING_KEYS[model.header.reading]) });
    }

    private renderRows(root: HTMLElement, rows: AgencyReviewRow[]): void {
        const list = root.createDiv({ cls: c("agency-review-list") });
        list.setAttribute("role", "list");
        for (const row of rows) {
            const item = list.createDiv({ cls: c("agency-review-row") });
            item.setAttribute("role", "listitem");

            const name = item.createSpan({ cls: c("agency-review-name"), text: row.basename });
            name.setAttribute("aria-label", t("agency_review_open_note", row.basename));
            makeActivatable(name, () => void this.app.workspace.openLinkText(row.path, "", false), "link");

            item.createSpan({
                cls: c("agency-review-verdict", "agency-review-verdict--" + row.verdict),
                text: t(VERDICT_KEYS[row.verdict] ?? "judgement_verdict_accepted"),
            });
            item.createSpan({ cls: c("agency-review-origin"), text: t(ORIGIN_KEYS[row.origin] ?? "judgement_origin_human") });
            if (row.confidence) {
                item.createSpan({
                    cls: c("agency-review-confidence"),
                    text: t(`confidence_${row.confidence}` as LocaleKey),
                });
            }
            item.createSpan({ cls: c("agency-review-when"), text: new Date(row.at).toLocaleDateString() });
            if (row.note) item.createSpan({ cls: c("agency-review-note"), text: row.note });
        }
    }
}

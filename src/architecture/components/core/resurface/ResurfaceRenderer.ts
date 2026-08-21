import { App, MarkdownView } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import {
    ResurfaceCandidate,
    ResurfaceReason,
    ResurfacedNote,
    pickDailySpark,
    rankResurfacedNotes,
} from "application/notes/resurfaceRanking";
import { buildResurfaceInputs } from "architecture/components/core/resurface/resurfaceInputs";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";

const THROTTLE_MS = 400;
const SPARK_COUNT = 3;

type ViewState = "no-active-note" | "ranking" | "ready" | "no-relations" | "spark" | "error";

/**
 * The **Forgotten** mode of the Discovery surface (#272, formerly `ResurfaceView`): given the active
 * note, a bounded ranked list of older/related notes worth revisiting — each with a plain-language
 * reason and one-click open + insert-link — plus an on-demand "daily spark". Render byte-identical.
 */
export class ResurfaceRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "no-active-note";
    private ranked: ResurfacedNote[] = [];
    private sparkResults: ResurfaceCandidate[] = [];
    private candidates: ResurfaceCandidate[] = [];
    private activePath: string | null = null;
    private throttleTimer: number | undefined;

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        this.registerWorkspaceListeners();
        this.recompute();
    }

    onunload(): void {
        window.clearTimeout(this.throttleTimer);
        this.container.empty();
    }

    private registerWorkspaceListeners(): void {
        const throttled = () => {
            window.clearTimeout(this.throttleTimer);
            this.throttleTimer = window.setTimeout(() => this.recompute(), THROTTLE_MS);
        };
        this.registerEvent(this.app.workspace.on("active-leaf-change", throttled));
        this.registerEvent(this.app.workspace.on("file-open", throttled));
    }

    recompute(): void {
        this.state = "ranking";
        this.sparkResults = [];
        this.render();

        try {
            const start = Date.now();
            const inputs = buildResurfaceInputs(this.app);
            this.candidates = inputs.candidates;

            const activeFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
            this.activePath = activeFile ? activeFile.path : null;

            if (!activeFile) {
                this.state = "no-active-note";
                this.render();
                return;
            }

            const active = inputs.buildActiveSignals(activeFile);
            this.ranked = rankResurfacedNotes({
                active,
                candidates: this.candidates,
                now: Date.now(),
                excludePaths: [active.path],
            });
            this.state = this.ranked.length > 0 ? "ready" : "no-relations";

            log.debug(
                `[Resurface] ranked ${this.candidates.length} candidates in ${Date.now() - start}ms — ` +
                `surfaced=${this.ranked.length}`
            );
        } catch (err) {
            this.state = "error";
            log.error(`[Resurface] ranking failed: ${err}`);
        }

        this.render();
    }

    private showDailySpark(): void {
        const exclude = this.activePath ? [this.activePath] : [];
        this.sparkResults = pickDailySpark(this.candidates, Date.now(), SPARK_COUNT, exclude);
        this.state = "spark";
        this.render();
    }

    render(): void {
        const host = this.container;
        host.empty();

        const container = host.createDiv({ cls: c("resurface") });

        const header = container.createDiv({ cls: c("resurface-header") });
        header.createEl("h4", { text: t("resurface_view_title"), cls: c("resurface-title") });
        const refreshBtn = header.createEl("button", {
            text: t("resurface_refresh_button"),
            cls: c("resurface-refresh-button"),
            attr: { "aria-label": t("resurface_refresh_button") },
        });
        this.registerDomEvent(refreshBtn, "click", () => this.recompute());
        const sparkBtn = header.createEl("button", {
            text: t("resurface_spark_button"),
            cls: c("resurface-spark-button"),
            attr: { "aria-label": t("resurface_spark_button") },
        });
        this.registerDomEvent(sparkBtn, "click", () => this.showDailySpark());

        switch (this.state) {
            case "ranking":
                container.createDiv({ cls: c("resurface-status"), text: t("resurface_ranking") });
                break;
            case "no-active-note":
                container.createDiv({ cls: c("resurface-status"), text: t("resurface_no_active") });
                break;
            case "no-relations":
                container.createDiv({ cls: c("resurface-status"), text: t("resurface_no_relations") });
                break;
            case "error":
                container.createDiv({
                    cls: [c("resurface-status"), c("resurface-status--error")].join(" "),
                    text: t("resurface_error"),
                });
                break;
            case "ready":
                this.renderRanked(container);
                break;
            case "spark":
                this.renderSpark(container);
                break;
        }
    }

    private renderRanked(container: HTMLElement): void {
        const list = container.createDiv({ cls: c("resurface-list") });
        for (const note of this.ranked) {
            this.renderRow(list, note.path, note.basename, this.reasonText(note.reasons));
        }
    }

    private renderSpark(container: HTMLElement): void {
        const section = container.createDiv({ cls: c("resurface-section") });
        section.createEl("h5", { text: t("resurface_spark_heading"), cls: c("resurface-section-heading") });
        const list = section.createDiv({ cls: c("resurface-list") });
        for (const candidate of this.sparkResults) {
            this.renderRow(list, candidate.path, candidate.basename, null);
        }
    }

    private renderRow(container: HTMLElement, path: string, basename: string, reason: string | null): void {
        const row = container.createDiv({ cls: c("resurface-item") });

        const main = row.createDiv({ cls: c("resurface-item-main") });
        const nameEl = main.createSpan({ text: basename, cls: c("resurface-item-name") });
        nameEl.setAttribute("title", path);
        this.registerDomEvent(nameEl, "click", () => void this.app.workspace.openLinkText(path, "", false));
        if (reason) {
            main.createSpan({ text: reason, cls: c("resurface-item-reason") });
        }

        const actions = row.createDiv({ cls: c("resurface-item-actions") });
        const openBtn = actions.createEl("button", {
            text: t("resurface_open"),
            cls: c("resurface-open-button"),
            attr: { "aria-label": t("resurface_open") },
        });
        this.registerDomEvent(openBtn, "click", () => void this.app.workspace.openLinkText(path, "", false));

        const insertBtn = actions.createEl("button", {
            text: t("resurface_insert_link"),
            cls: c("resurface-insert-button"),
            attr: { "aria-label": t("resurface_insert_link") },
        });
        this.registerDomEvent(insertBtn, "click", () => this.insertLink(basename));
    }

    private insertLink(basename: string): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        view.editor.replaceSelection(`[[${basename}]]`);
    }

    private reasonText(reasons: ResurfaceReason[]): string {
        return reasons.map((reason) => this.reasonPhrase(reason)).join(" · ");
    }

    private reasonPhrase(reason: ResurfaceReason): string {
        if (reason.kind === "tag") {
            const tags = reason.shared.map((tag) => `#${tag}`).join(", ");
            return reason.shared.length > 1 ? t("resurface_reason_tags", tags) : t("resurface_reason_tag", tags);
        }
        if (reason.kind === "backlink") {
            return t("resurface_reason_backlink");
        }
        return reason.shared.length > 0 ? t("resurface_reason_shared_link") : t("resurface_reason_link");
    }
}

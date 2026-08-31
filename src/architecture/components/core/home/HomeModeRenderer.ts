import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { activateSurface, DevelopmentJournal } from "architecture/plugin";
import { KnowledgeIndex } from "architecture/knowledge";
import { HomeModel, buildHome, readyToCultivate, developmentStreak } from "architecture/knowledge/state";
import type { KnowledgeRecommendation } from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { makeActivatable } from "architecture/components/core/a11y";
import { topRecommendations, isAllCaughtUp, REASON_LABEL_KEYS } from "architecture/components/core/home/homeRecommendations";

const DEBOUNCE_MS = 400;

type ViewState = "indexing" | "ready" | "empty" | "error";
type LocaleKey = Parameters<typeof t>[0];

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * The **Home** mode of the Home surface (#272, formerly `ZettelFlowHomeView`, #172): the narrative
 * front door — greeting, thinking days, new ideas, main concepts, review-due, suggested connections
 * and the next session. Composes the pure {@link buildHome}. Read-only; render byte-identical.
 */
export class HomeModeRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private home: HomeModel | null = null;
    private recommendations: KnowledgeRecommendation[] = [];
    private cultivateCount = 0;
    private streak = 0;
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
                this.home = null;
                this.render();
                return;
            }
            const model = index.getModel();
            const counts = DevelopmentJournal.getInstance().dailyCounts();
            const thinkingDays = Object.values(counts).filter((count) => count > 0).length;
            this.home = buildHome(model, { thinkingDays, now: Date.now() });
            this.recommendations = topRecommendations(model, undefined, JudgementLog.getInstance().entries());
            this.cultivateCount = readyToCultivate(model);
            this.streak = developmentStreak(JudgementLog.getInstance().dailyCounts(), Date.now());
            this.state = model.size() === 0 ? "empty" : "ready";
        } catch (error) {
            this.state = "error";
            log.error(`[ZettelFlowHome] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const host = this.container;
        host.empty();
        const container = host.createDiv({ cls: c("home") });

        const header = container.createDiv({ cls: c("home-header") });
        header.createEl("h4", { text: t("home_view_title"), cls: c("home-title") });
        const refresh = header.createEl("button", {
            text: t("home_refresh_button"),
            cls: c("home-refresh"),
            attr: { "aria-label": t("home_refresh_button") },
        });
        refresh.addEventListener("click", () => this.recompute());

        if (this.state === "indexing") {
            container.createDiv({ cls: c("home-status"), text: t("home_indexing") });
            return;
        }
        if (this.state === "error") {
            container.createDiv({ cls: c("home-status"), text: t("home_error") });
            return;
        }
        if (this.state === "empty" || !this.home) {
            container.createDiv({ cls: c("home-status"), text: t("home_empty") });
            return;
        }

        const greeting = container.createDiv({ cls: c("home-greeting") });
        greeting.createSpan({ text: t("home_greeting"), cls: c("home-greeting-hello") });
        greeting.createSpan({
            text: t("home_thinking_days", String(this.home.thinkingDays)),
            cls: c("home-thinking-days"),
        });

        this.renderGrowthNudge(container);
        this.renderCultivateTeaser(container);
        this.renderGraphTeaser(container);
        this.renderRecommendations(container);
        this.renderNoteSection(container, "home_section_new_ideas", this.home.newIdeas);
        this.renderNoteSection(container, "home_section_main_concepts", this.home.mainConcepts);
        this.renderNoteSection(container, "home_section_review_due", this.home.reviewDue);
        this.renderConnections(container, this.home.suggestedConnections);
    }

    /**
     * The Cultivate on-ramp (#309 S4): a one-click start of a guided thinking session on the
     * highest-leverage idea, with the count of ideas that still have development headroom.
     */
    private renderCultivateTeaser(container: HTMLElement): void {
        if (this.cultivateCount === 0) return;
        const teaser = container.createDiv({ cls: c("home-cultivate-teaser") });
        teaser.createDiv({ cls: c("home-cultivate-teaser-title"), text: t("home_cultivate_teaser_title") });
        teaser.createDiv({
            cls: c("home-cultivate-teaser-sub"),
            text: t("home_cultivate_teaser_sub", String(this.cultivateCount)),
        });
        if (this.streak > 0) {
            teaser.createDiv({
                cls: c("home-cultivate-teaser-streak"),
                text: t("home_cultivate_teaser_streak", String(this.streak)),
            });
        }
        const btn = teaser.createEl("button", {
            cls: c("home-cultivate-teaser-btn"),
            text: t("home_cultivate_teaser_cta"),
        });
        btn.setAttribute("aria-label", t("home_cultivate_teaser_cta"));
        btn.addEventListener("click", () => void activateSurface(this.app, "zettelflow-home", "cultivate"));
    }

    /**
     * The growth nudge (#285 S4): when fleeting notes are waiting, surface the count and a one-click
     * jump to develop the latest — the loop that turns quick captures into permanent notes. Silent
     * when the inbox is empty (nothing to nudge).
     */
    private renderGrowthNudge(container: HTMLElement): void {
        if (!this.home || this.home.fleetingCount === 0) return;
        const nudge = container.createDiv({ cls: c("home-nudge") });
        nudge.createSpan({
            cls: c("home-nudge-text"),
            text: t("home_nudge_fleeting", String(this.home.fleetingCount)),
        });
        const first = this.home.fleetingReady[0];
        if (!first) return;
        const cta = nudge.createEl("button", { cls: c("home-nudge-cta"), text: t("home_nudge_develop") });
        cta.setAttribute("aria-label", t("home_nudge_develop"));
        cta.addEventListener("click", () => void this.app.workspace.openLinkText(first, "", false));
    }

    /** The 3D-graph teaser (#285 S2): the eye-catching hook — one click into the Graph 3D mode. */
    private renderGraphTeaser(container: HTMLElement): void {
        const teaser = container.createDiv({ cls: c("home-graph-teaser") });
        teaser.createDiv({ cls: c("home-graph-teaser-title"), text: t("home_graph_teaser_title") });
        teaser.createDiv({ cls: c("home-graph-teaser-sub"), text: t("home_graph_teaser_sub") });
        const btn = teaser.createEl("button", { cls: c("home-graph-teaser-btn"), text: t("home_graph_teaser_cta") });
        btn.setAttribute("aria-label", t("home_graph_teaser_cta"));
        btn.addEventListener("click", () => void activateSurface(this.app, "zettelflow-graph", "3d"));
    }

    /** The "What to do next" section (#273): top recommendations, each row navigating to its target. */
    private renderRecommendations(container: HTMLElement): void {
        const section = container.createDiv({ cls: c("home-section") });
        section.createEl("h5", { text: t("home_section_recommendations"), cls: c("home-section-title") });

        if (isAllCaughtUp(this.recommendations)) {
            section.createDiv({ cls: c("home-recommendation-clear"), text: t("home_recommendation_reason_all-clear") });
            return;
        }

        const list = section.createDiv({ cls: c("home-list") });
        for (const rec of this.recommendations) {
            if (rec.reason === "all-clear") continue;
            const row = list.createDiv({ cls: c("home-recommendation") });
            row.createSpan({ text: t(REASON_LABEL_KEYS[rec.reason]), cls: c("home-recommendation-reason") });
            if (rec.target.length > 0) {
                const target = rec.target[0];
                const name = row.createSpan({ text: basename(target), cls: c("home-note-name") });
                name.setAttribute("title", target);
                makeActivatable(name, () => void this.app.workspace.openLinkText(target, "", false));
            }
        }
    }

    private renderNoteSection(container: HTMLElement, headingKey: LocaleKey, paths: string[]): void {
        const section = container.createDiv({ cls: c("home-section") });
        section.createEl("h5", { text: t(headingKey), cls: c("home-section-title") });
        if (paths.length === 0) {
            section.createDiv({ cls: c("home-section-empty"), text: t("home_section_empty") });
            return;
        }
        const list = section.createDiv({ cls: c("home-list") });
        for (const path of paths) this.renderNoteRow(list, path);
    }

    private renderConnections(container: HTMLElement, pairs: { a: string; b: string }[]): void {
        const section = container.createDiv({ cls: c("home-section") });
        section.createEl("h5", { text: t("home_section_suggested_connections"), cls: c("home-section-title") });
        if (pairs.length === 0) {
            section.createDiv({ cls: c("home-section-empty"), text: t("home_section_empty") });
            return;
        }
        const list = section.createDiv({ cls: c("home-list") });
        for (const pair of pairs) {
            const row = list.createDiv({ cls: c("home-connection") });
            this.renderInlineNote(row, pair.a);
            row.createSpan({ text: " · ", cls: c("home-connection-sep") });
            this.renderInlineNote(row, pair.b);
        }
    }

    private renderNoteRow(list: HTMLElement, path: string): void {
        const row = list.createDiv({ cls: c("home-row") });
        this.renderInlineNote(row, path);
    }

    private renderInlineNote(parent: HTMLElement, path: string): void {
        const name = parent.createSpan({ text: basename(path), cls: c("home-note-name") });
        name.setAttribute("title", path);
        makeActivatable(name, () => void this.app.workspace.openLinkText(path, "", false));
    }
}

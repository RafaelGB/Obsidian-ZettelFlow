import { App, Notice } from "obsidian";
import { c, log } from "architecture";
import { hoverPreview, makeActivatable } from "architecture/components/core/a11y";
import { t, tCount } from "architecture/lang";
import { ModeHeader } from "architecture/components/core/surface/ModeHeader";
import { runCommand } from "architecture/components/core/surface/runCommand";
import { KnowledgeIndex, STATE_LABEL_KEY } from "architecture/knowledge";
import {
    TEND_ISSUES,
    deriveTend,
    filterTend,
    tendFocus,
    type TendIssue,
    type TendList,
    type TendRow,
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import {
    openNoteCompanion,
    type CompanionRequest,
} from "architecture/components/core/noteCompanion/openNoteCompanion";

const DEBOUNCE_MS = 400;
/** Cap the DOM rows (#302 S5): a huge vault can have thousands of notes that need you. */
export const MAX_TEND_ROWS = 200;


type LocaleKey = Parameters<typeof t>[0];

/** What each issue is called on a chip. A literal map, so the locale guardrail sees every key. */
const ISSUE_LABEL: Record<TendIssue, LocaleKey> = {
    "no-source": "tend_issue_no_source",
    "links-nowhere": "tend_issue_links_nowhere",
    "nobody-links": "tend_issue_nobody_links",
    "open-question": "tend_issue_open_question",
};

/** The one thing Tend does outside itself — injectable so a test can watch the hand-over. */
export interface TendDeps {
    openCompanion: (app: App, request: CompanionRequest) => Promise<void>;
}

type ViewState = "indexing" | "ready" | "clear" | "error";

/**
 * **Tend** — the first mode of the Health surface (#644, epic #639).
 *
 * The mode it replaces diagnosed and never helped: it said *37 orphans*, listed the same note up to
 * three times, and its *Connect now* only opened the note. Tend lists each note that needs you
 * **once**, with everything it is missing as chips, and a row opens the note **and** This note on
 * the fix — the loop the old mode never closed.
 *
 * Reads the model only (`deriveTend`, once per revision); writes nothing. The weekly review stays
 * the header's one primary action. The live enrichment pass sits under the lede, the one thing here
 * that is happening now; the Speed history lives in Settings › Advanced (#645).
 */
export class TendRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private list: TendList | null = null;
    private lastRevision = -1;
    /** The chip you pressed. Not persisted: a mode reopened starts from everything (FR-9). */
    private filter: TendIssue | null = null;
    private debounceTimer: number | undefined;
    private chipHost: HTMLElement | undefined;
    private listHost: HTMLElement | undefined;
    /** Where {@link renderPassRow} draws, so progress never re-renders the whole mode. */
    private passHost: HTMLElement | undefined;
    /** Live progress of the enrichment pass, when one is running. */
    private pass: { done: number; total: number } | undefined;

    constructor(
        container: HTMLElement,
        private readonly app: App,
        private readonly deps: TendDeps = { openCompanion: openNoteCompanion }
    ) {
        super(container);
    }

    onload(): void {
        this.filter = null;
        // A reopened mode has an empty container: forget the last read so the guard lets it draw.
        this.list = null;
        this.lastRevision = -1;
        this.registerVaultListeners();
        this.watchPass();
        this.recompute();
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        // Stop listening before the DOM goes, or a pass still running would draw into nothing.
        KnowledgeIndex.getInstance().onEnrichmentProgress(undefined);
        this.passHost = undefined;
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

    recompute(force = false): void {
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "indexing";
                this.list = null;
                this.render();
                return;
            }
            const model = index.getModel();
            const revision = model.revision();
            // Nothing changed since the last read: keep the DOM you are looking at (#302 S1).
            if (!force && this.list && this.state !== "error" && revision === this.lastRevision) return;
            this.lastRevision = revision;
            this.list = deriveTend(model);
            this.state = this.list.rows.length > 0 ? "ready" : "clear";
        } catch (error) {
            this.state = "error";
            this.list = null;
            log.error(`[Tend] could not read the vault: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.render();
    }

    private render(): void {
        const host = this.container;
        host.empty();
        this.chipHost = undefined;
        this.listHost = undefined;
        const root = host.createDiv({ cls: c("tend") });

        const header = root.createDiv({ cls: c("tend-header") });
        header.createEl("h4", { text: t("surface_mode_tend"), cls: c("tend-title") });
        // The weekly review reads what this mode shows and writes the note that summarises it, so
        // the offer belongs beside the list it is about (#578) — the header's one primary (#577).
        // This draw's listeners go with this draw: a redraw on every vault change must not pile up.
        const scope = this.scope("render");
        const bar = new ModeHeader(header, (el, type, handler) => scope.registerDomEvent(el, type, handler));
        bar.primary({
            label: t("weekly_review_command_name"),
            icon: "calendar-check",
            onClick: () => runCommand("generate-weekly-review"),
        });
        bar.nav({ label: t("slipbox_health_refresh_button"), onClick: () => this.recompute(true) });
        bar.done();

        if (this.state === "indexing" || this.state === "error") {
            root.createDiv({
                cls: [c("tend-status"), ...(this.state === "error" ? [c("tend-status--error")] : [])].join(" "),
                text: t(this.state === "indexing" ? "slipbox_health_indexing" : "slipbox_health_error"),
            });
            return;
        }

        const list = this.list!;
        if (this.state === "clear") {
            root.createDiv({ cls: c("tend-lede"), text: t("tend_lede_none") });
            this.passHost = root.createDiv({ cls: c("tend-pass") });
            this.renderPassRow();
        } else {
            const count = list.rows.length;
            root.createDiv({ cls: c("tend-lede"), text: tCount(count, "tend_lede", String(count)) });
            root.createDiv({ cls: c("tend-hint"), text: t("tend_hint") });
            this.passHost = root.createDiv({ cls: c("tend-pass") });
            this.renderPassRow();
            this.chipHost = root.createDiv({
                cls: c("tend-filters"),
                attr: { role: "group", "aria-label": t("tend_filter_label") },
            });
            this.listHost = root.createDiv({ cls: c("tend-list") });
            this.renderChips();
            this.renderList();
        }
        if (list.clear > 0 && this.state === "ready") {
            root.createDiv({ cls: c("tend-clear"), text: tCount(list.clear, "tend_clear", String(list.clear)) });
        }
    }

    /** One chip per issue that some row carries, with its count; *All* first. */
    private renderChips(): void {
        const host = this.chipHost;
        const list = this.list;
        if (!host || !list) return;
        host.empty();
        const scope = this.scope("chips");
        const chip = (issue: TendIssue | null, label: string, count: number) => {
            const active = this.filter === issue;
            const button = host.createEl("button", {
                cls: [c("tend-filter"), ...(active ? ["is-active"] : [])].join(" "),
                attr: { type: "button", "aria-pressed": String(active) },
            });
            button.createSpan({ text: label });
            button.createSpan({ cls: c("tend-filter-count"), text: String(count) });
            scope.registerDomEvent(button, "click", () => {
                this.filter = issue;
                this.renderChips();
                this.renderList();
            });
        };
        chip(null, t("tend_filter_all"), list.rows.length);
        for (const issue of TEND_ISSUES) {
            if (list.counts[issue] > 0) chip(issue, t(ISSUE_LABEL[issue]), list.counts[issue]);
        }
    }

    private renderList(): void {
        const host = this.listHost;
        const list = this.list;
        if (!host || !list) return;
        host.empty();
        const rows = filterTend(list, this.filter);
        for (const row of rows.slice(0, MAX_TEND_ROWS)) this.renderRow(host, row);
        if (rows.length > MAX_TEND_ROWS) {
            const more = rows.length - MAX_TEND_ROWS;
            host.createDiv({ cls: c("tend-more"), text: tCount(more, "tend_more", String(more)) });
        }
    }

    /** A row is one note: its name, what it is missing, and where it stands. */
    private renderRow(host: HTMLElement, row: TendRow): void {
        const el = host.createDiv({ cls: c("tend-row"), attr: { title: row.path } });
        const name = el.createSpan({ cls: c("tend-row-name"), text: row.title.replace(/\.md$/i, "") });
        const chips = el.createDiv({ cls: c("tend-row-chips") });
        for (const issue of row.issues) chips.createSpan({ cls: c("tend-chip"), text: t(ISSUE_LABEL[issue]) });
        const stateKey = (STATE_LABEL_KEY as Record<string, string>)[row.state];
        chips.createSpan({
            cls: [c("tend-chip"), c("tend-chip--state")].join(" "),
            text: stateKey ? t(stateKey as LocaleKey) : row.state,
        });
        makeActivatable(
            el,
            () =>
                void this.handOver(row).catch((error: unknown) =>
                    log.error(`[Tend] could not hand ${row.path} over: ${error instanceof Error ? error.message : String(error)}`)
                ),
            "button"
        );
        hoverPreview(this.app, name, row.path, this);
    }

    /** Open the note, and This note beside it on what this row said it was missing. */
    private async handOver(row: TendRow): Promise<void> {
        await this.app.workspace.openLinkText(row.path, "", false);
        await this.deps.openCompanion(this.app, { path: row.path, ...tendFocus(row, this.filter) });
    }

    /**
     * Watch the enrichment pass while this mode is open (#462 FR-1/FR-2): progress at each yield
     * boundary and a **Stop** that leaves the model consistent — every note applied whole or not at all.
     */
    private watchPass(): void {
        KnowledgeIndex.getInstance().onEnrichmentProgress((progress) => {
            this.pass = progress.done >= progress.total ? undefined : progress;
            this.renderPassRow();
        });
    }

    private renderPassRow(): void {
        if (!this.passHost) return;
        this.passHost.empty();
        // A tick redraws this row; its Stop button's listener goes with the tick that drew it.
        const scope = this.scope("pass");
        if (!this.pass) return;
        this.passHost.createSpan({
            cls: c("tend-pass-text"),
            text: t("speed_pass_running", String(this.pass.done), String(this.pass.total)),
        });
        const stop = this.passHost.createEl("button", {
            text: t("speed_pass_cancel"),
            cls: c("speed-stop"),
            attr: { type: "button" },
        });
        scope.registerDomEvent(stop, "click", () => {
            const stopped = this.pass?.done ?? 0;
            KnowledgeIndex.getInstance().cancelEnrichment();
            this.pass = undefined;
            this.renderPassRow();
            new Notice(t("speed_pass_stopped", String(stopped)));
        });
    }
}

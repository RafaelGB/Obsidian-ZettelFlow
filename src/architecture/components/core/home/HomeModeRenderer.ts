import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { App, TFile, moment as obsidianMoment, setIcon } from "obsidian";
import type MomentFn from "moment";
import { c, log, ObsidianApi } from "architecture";
import { t, tCount } from "architecture/lang";
import { activateSurface } from "architecture/plugin";
import { draftStore } from "architecture/plugin/noteBuilder/DraftStore";
import { KnowledgeIndex, STATE_LABEL_KEY } from "architecture/knowledge";
import {
    runGraphQuery,
    dueClaims,
    selectCultivationTarget,
    type DueClaim,
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { runCommand } from "architecture/components/core/surface/runCommand";
import { makeActivatable, hoverPreview } from "architecture/components/core/a11y";
import { pinnedQueries, savedQueryLabel } from "architecture/components/core/askGraph/savedQueries";
import { lastReviewedOf } from "architecture/plugin/claims/lastReviewedOf";
import { wagersOf } from "architecture/plugin/claims/wagersOf";
import { openReturn } from "starters/zcomponents/ClaimReturnComponent";
import { openReader } from "architecture/components/core/reader/openReader";
import { openLibrary } from "architecture/components/core/library/openLibrary";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { openReview } from "architecture/components/core/review/ReviewModal";
import { familyPage, eyebrow, keyHints } from "architecture/components/core/family/family";
import { renderComposer, type Composer } from "architecture/components/core/family/ThoughtComposer";
import { readingInProgress, type ReadingInProgress } from "./homeResume";
import type { Thought } from "application/thinking/thought";

const moment = obsidianMoment as unknown as typeof MomentFn;

/** A pinned "ask your graph" query resolved against the current model (#323 G4). */
type PinnedQueryCard = { label: string; query: string; count: number };

/** The one idea Home invites you to tend (#703): its path, and what it says when it says anything. */
type IdeaToTend = { path: string; title: string; claim: string | null; stateKey: string | null; created: number };

const DEBOUNCE_MS = 400;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type ViewState = "indexing" | "ready" | "empty" | "error";
type LocaleKey = Parameters<typeof t>[0];

/** A month and a year, in the reader's locale. Never a count of days (#563). */
function when(at: number): string {
    return new Date(at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/** The moment of the day, in words — the greeting, never a counter (#703). */
export function greetingKey(hour: number): LocaleKey {
    if (hour < 6) return "home_greet_night";
    if (hour < 12) return "home_greet_morning";
    if (hour < 19) return "home_greet_afternoon";
    return "home_greet_evening";
}

/**
 * The **Home** mode of the Home surface (#703, epic #701): the place you land when Obsidian opens.
 *
 * It used to be a dashboard of tiles — a counter of thinking days, a "what to do next" list, three
 * eyebrow tiles and nine more sections behind *Show everything*. It is a page now, in Think's
 * family: a greeting for the moment of day with one plain fact, Think's composer right there, where
 * you left off, what came back today, one idea to tend, and your questions. The rest has a better
 * home — Explore's suggested questions and Health › Tend — and keeps its door there.
 *
 * Read-only, except the composer, which writes a thought (never a note).
 */
export class HomeModeRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private pinnedCards: PinnedQueryCard[] = [];
    /** The one claim ready to be looked at again, or nothing at all (#563). */
    private claimReturn: DueClaim | null = null;
    /** Whether something you marked in the Reader is due a second look today (#678). */
    private highlightsDue = false;
    /** One plain fact for the greeting: what you wrote this week (#703). */
    private notesThisWeek = 0;
    private thoughtsThisWeek = 0;
    private idea: IdeaToTend | null = null;
    private lastNote: string | null = null;
    private reading: ReadingInProgress | null = null;
    private lastThought: Thought | undefined;
    private composer: Composer | undefined;
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
        // Continuous (#365, D5): every vault change re-reads what Home says — it updates itself,
        // which is why the Refresh button left (#703). `create` is explicit so a brand-new note
        // triggers a pass without waiting on metadata resolution.
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("create", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
    }

    private recompute(): void {
        const store = ThoughtStore.getInstance();
        // Think is not the index: what you marked can come back while the graph is still indexing.
        this.highlightsDue = store.anyHighlightDue();
        const now = Date.now();
        this.thoughtsThisWeek = store.countSince(now - WEEK_MS);
        const settings = ObsidianApi.getOwnPlugin()?.settings;
        this.reading = readingInProgress(settings);
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "indexing";
                this.resetModel();
                this.render();
                return;
            }
            const model = index.getModel();
            const judgements = JudgementLog.getInstance().entries();
            this.notesThisWeek = model.all().filter((idea) => idea.created >= now - WEEK_MS).length;
            this.lastNote = this.findLastNote((path) => Boolean(model.get(path)));
            // Pinned "ask your graph" queries (#323 G4): each resolved against the live model, a chip
            // that opens Explore asking it again.
            this.pinnedCards = pinnedQueries(settings?.savedGraphQueries).map((entry) => {
                const result = runGraphQuery(model, entry.query);
                return { label: savedQueryLabel(entry), query: entry.query, count: result.error ? 0 : result.matches.length };
            });
            // At most one, and only past the interval you chose. Nothing accumulates here (#563).
            this.claimReturn = settings
                ? dueClaims({
                      model,
                      judgements,
                      snapshots: settings.timeline?.enabled ? settings.timeline.snapshots : {},
                      lastReviewed: lastReviewedOf(model, settings.lifecycle?.lastReviewedProperty),
                      horizons: wagersOf(model),
                      intervalDays: settings.returnIntervalDays,
                      now,
                  })[0] ?? null
                : null;
            // One invitation, not a list (#703): the idea Cultivate would offer first.
            const target = selectCultivationTarget(model);
            const idea = target ? model.get(target) : undefined;
            this.idea = idea
                ? {
                      path: idea.path,
                      title: idea.title || basename(idea.path),
                      claim: idea.claims.find((claim) => claim.text.trim())?.text.trim() ?? null,
                      stateKey: (STATE_LABEL_KEY as Record<string, string>)[idea.state] ?? null,
                      created: idea.created,
                  }
                : null;
            this.state = model.size() === 0 ? "empty" : "ready";
        } catch (error) {
            this.state = "error";
            // Reset like indexing, so a failed pass never leaves a claim from the last good one.
            this.resetModel();
            log.error(`[ZettelFlowHome] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
        void this.readLastThought();
    }

    private resetModel(): void {
        this.pinnedCards = [];
        this.claimReturn = null;
        this.idea = null;
        this.notesThisWeek = 0;
        this.lastNote = null;
    }

    /** The last thought is the one read that needs a file; it fills its card when it arrives. */
    private async readLastThought(): Promise<void> {
        const thought = await ThoughtStore.getInstance().latest();
        if (thought?.id === this.lastThought?.id) return;
        this.lastThought = thought;
        if (this.state === "ready") this.render();
    }

    /** The note you were in last that this vault's model knows — Obsidian keeps the list. */
    private findLastNote(known: (path: string) => boolean): string | null {
        const recent = this.app.workspace.getLastOpenFiles?.() ?? [];
        return recent.find((path) => path.toLowerCase().endsWith(".md") && known(path)) ?? null;
    }

    private render(): void {
        const host = this.container;
        // Typing is never interrupted by a background redraw.
        const writing = this.composer?.area.value ?? "";
        const hadFocus = this.composer?.area.ownerDocument?.activeElement === this.composer?.area;
        host.empty();
        const page = familyPage(host, "home");

        // ── the greeting, the one fact, and the composer ──
        const top = page.createDiv({ cls: c("home-top") });
        const hello = top.createDiv({ cls: c("home-hello-col") });
        hello.createEl("h1", { cls: c("home-hello"), text: t(greetingKey(new Date().getHours())) });
        hello.createDiv({ cls: c("home-hello-sub"), text: this.helloLine() });
        this.composer = renderComposer(hello, {
            placeholder: t("home_composer_placeholder"),
            hint: t("home_composer_hint"),
            register: (el, type, handler) => this.registerDomEvent(el, type, handler as (event: Event) => void),
            onKept: () => {
                this.thoughtsThisWeek += 1;
                void this.readLastThought();
            },
        });
        this.composer.area.value = writing;
        if (hadFocus) this.composer.focus();

        // A wizard left mid-flow: one nudge, only when there is a draft.
        this.renderUnfinishedNote(page);

        if (this.state === "indexing") {
            page.createDiv({ cls: c("home-status"), text: t("home_indexing") });
            this.renderCameBack(page);
            this.renderKeys(page);
            return;
        }
        if (this.state === "error") {
            page.createDiv({ cls: c("home-status"), text: t("home_error") });
            this.renderKeys(page);
            return;
        }
        if (this.state === "empty") {
            this.renderFirstDay(page);
            this.renderKeys(page);
            return;
        }

        this.renderLeftOff(page);
        this.renderCameBack(page);
        this.renderIdea(page);
        this.renderQuestions(page);
        this.renderKeys(page);
    }

    /** The date, and one plain fact about the week — a fact, never a count of days or a score (§XII). */
    private helloLine(): string {
        const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
        if (this.state === "empty") return t("home_hello_first", date);
        if (this.state !== "ready") return date;
        if (this.notesThisWeek === 0 && this.thoughtsThisWeek === 0) return t("home_hello_quiet", date);
        return t(
            "home_hello_week",
            date,
            tCount(this.notesThisWeek, "home_fact_notes", String(this.notesThisWeek)),
            tCount(this.thoughtsThisWeek, "home_fact_thoughts", String(this.thoughtsThisWeek))
        );
    }

    private renderKeys(page: HTMLElement): void {
        keyHints(page, [
            { keys: ["/"], label: t("home_key_write") },
            { keys: ["Ctrl", "Enter"], label: t("home_key_keep") },
        ]);
    }

    /** A card under *Where you left off* or *Three ways in*: what it is, its name, one line, a door. */
    private card(
        parent: HTMLElement,
        icon: string,
        kind: string,
        title: string,
        line: string,
        open: () => void,
        progress?: number
    ): HTMLElement {
        const card = parent.createEl("button", { cls: [c("family-card"), c("home-card")], attr: { type: "button" } });
        const head = card.createSpan({ cls: c("home-card-kind") });
        setIcon(head.createSpan({ cls: c("home-card-icon") }), icon);
        head.createSpan({ text: kind });
        card.createSpan({ cls: [c("home-card-title"), c("family-idea-text")], text: title });
        card.createSpan({ cls: c("home-card-line"), text: line });
        if (progress !== undefined) {
            const meter = card.createSpan({
                cls: c("home-card-meter"),
                attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(progress * 100)) },
            });
            meter.createSpan({ cls: c("home-card-meter-fill") }).setCssProps({ "--zf-progress": String(progress) });
        }
        this.registerDomEvent(card, "click", open);
        return card;
    }

    /** Where you left off (#703): the last note, the reading in progress, the last thread. */
    private renderLeftOff(page: HTMLElement): void {
        const reading = this.reading;
        const thought = this.lastThought;
        if (!this.lastNote && !reading && !thought) return;
        const section = page.createDiv({ cls: c("home-section") });
        eyebrow(section, "rotate-ccw", t("home_left_off"));
        const row = section.createDiv({ cls: c("home-cards") });
        if (this.lastNote) {
            const path = this.lastNote;
            const file = this.app.vault.getAbstractFileByPath(path);
            const edited = file instanceof TFile ? t("home_left_note_line", moment(file.stat.mtime).fromNow()) : path;
            const card = this.card(row, "file-text", t("home_left_note"), basename(path), edited, () =>
                void this.app.workspace.openLinkText(path, "", false)
            );
            hoverPreview(this.app, card, path, this);
        }
        if (reading) {
            this.card(
                row,
                "book-open",
                t("home_left_reading"),
                reading.title,
                t("home_left_reading_line", String(reading.chapter + 1), String(reading.total)),
                () => void this.openReading(reading),
                Math.min(1, (reading.chapter + 1) / Math.max(1, reading.total))
            );
        }
        if (thought) {
            const first = thought.text.trim().split(/\r?\n/)[0] ?? "";
            const title = first.length > 80 ? `${first.slice(0, 79)}…` : first || t("home_left_thought_untitled");
            const line = thought.about
                ? t("home_left_thought_about", basename(thought.about))
                : t("home_left_thought_line", moment(thought.at).fromNow());
            this.card(row, "lightbulb", t("home_left_thought"), title, line, () =>
                void activateSurface(this.app, "zettelflow-home", "lab", thought.about ? { about: thought.about } : undefined)
            );
        }
    }

    private async openReading(reading: ReadingInProgress): Promise<void> {
        const open = reading.open;
        if (open.kind === "source") await openReader(this.app, { seed: open.path, source: open.path, chapter: reading.chapter });
        else if (open.kind === "saved")
            await openReader(this.app, { seed: open.seed, kind: "selection", paths: open.paths, name: open.name, chapter: reading.chapter });
        else await openReader(this.app, { seed: open.seed, kind: open.reading, chapter: reading.chapter });
    }

    /**
     * What came back today (#703): what you marked in the Reader and a claim of yours, if either is
     * due. Silent on a day nothing is — no empty box, no count, nothing about what you skipped.
     */
    private renderCameBack(page: HTMLElement): void {
        const due = this.claimReturn;
        if (!this.highlightsDue && !due) return;
        const section = page.createDiv({ cls: c("home-section") });
        eyebrow(section, "undo-2", t("home_came_back"));
        const list = section.createDiv({ cls: c("home-came-back") });
        if (this.highlightsDue) {
            const row = list.createDiv({ cls: [c("family-card"), c("home-came-back-row")] });
            row.createDiv({ cls: c("home-came-back-title"), text: t("review_title") });
            row.createDiv({ cls: c("home-card-line"), text: t("review_home_sub") });
            const open = row.createEl("button", { cls: "mod-cta", text: t("review_home_open"), attr: { type: "button" } });
            this.registerDomEvent(open, "click", () => void openReview(this.app));
        }
        if (due) {
            const wager = due.kind === "wager";
            const row = list.createDiv({ cls: [c("family-card"), c("home-came-back-row")] });
            row.createDiv({
                cls: c("home-came-back-title"),
                text: t(wager ? "home_claim_return_wager_title" : "home_claim_return_title"),
            });
            row.createDiv({
                cls: c("home-card-line"),
                text: wager
                    ? t("home_claim_return_wager_when", when(due.lastTouched))
                    : t("home_claim_return_when", when(due.lastTouched)),
            });
            const open = row.createEl("button", {
                text: t(wager ? "home_claim_return_wager_open" : "home_claim_return_open"),
                attr: { type: "button" },
            });
            this.registerDomEvent(open, "click", () => {
                const plugin = ObsidianApi.getOwnPlugin();
                // `derived` — the system brought it back. Opening it yourself records `human` (#562).
                if (plugin) openReturn(plugin, due.path, "derived");
            });
        }
    }

    /**
     * One idea to tend (#703): a single invitation instead of a list — the idea Cultivate would
     * offer first, quoting what it says. It opens Cultivate on that idea; nothing is written here.
     */
    private renderIdea(page: HTMLElement): void {
        const idea = this.idea;
        if (!idea) return;
        const section = page.createDiv({ cls: c("home-section") });
        eyebrow(section, "sprout", t("home_idea_to_tend"));
        const invite = section.createDiv({ cls: c("home-invite") });
        setIcon(invite.createDiv({ cls: c("home-invite-icon") }), "sprout");
        const words = invite.createDiv({ cls: c("home-invite-words") });
        const quote = words.createDiv({
            cls: [c("home-invite-text"), c("family-idea-text")],
            text: idea.claim ? t("home_idea_quote", idea.claim) : idea.title,
        });
        makeActivatable(quote, () => void this.app.workspace.openLinkText(idea.path, "", false));
        hoverPreview(this.app, quote, idea.path, this);
        const facts = [idea.claim ? idea.title : null, idea.stateKey ? t(idea.stateKey as LocaleKey) : null]
            .filter((fact): fact is string => Boolean(fact))
            .join(" · ");
        words.createDiv({ cls: c("home-card-line"), text: facts || t("home_idea_planted", moment(idea.created).fromNow()) });
        const go = invite.createEl("button", { cls: "mod-cta", attr: { type: "button" } });
        go.createSpan({ text: t("home_idea_go") });
        setIcon(go.createSpan({ cls: c("home-invite-go") }), "arrow-right");
        this.registerDomEvent(go, "click", () =>
            void activateSurface(this.app, "zettelflow-home", "cultivate", { target: idea.path })
        );
    }

    /** Your questions (#703): the queries you pinned, each a chip that asks it again in Explore. */
    private renderQuestions(page: HTMLElement): void {
        if (this.pinnedCards.length === 0) return;
        const section = page.createDiv({ cls: c("home-section") });
        eyebrow(section, "search", t("home_section_pinned_queries"));
        const chips = section.createDiv({ cls: c("home-questions") });
        for (const card of this.pinnedCards) {
            const chip = chips.createEl("button", { cls: c("home-question-chip"), attr: { type: "button", title: card.query } });
            chip.createSpan({ text: card.label });
            chip.createSpan({ cls: c("home-question-count"), text: String(card.count) });
            this.registerDomEvent(chip, "click", () =>
                void activateSurface(this.app, "zettelflow-explore", "explore", { query: card.query })
            );
        }
    }

    /**
     * The first day (#703): an empty vault is greeted with three ways in, not an empty page — write a
     * first note with a flow, read something you already have, or just think in the box above.
     */
    private renderFirstDay(page: HTMLElement): void {
        const section = page.createDiv({ cls: c("home-section") });
        eyebrow(section, "sprout", t("home_first_ways"));
        const row = section.createDiv({ cls: c("home-cards") });
        this.card(row, "file-plus", t("home_left_note"), t("home_first_note"), t("home_first_note_line"), () =>
            runCommand("open-workflow")
        );
        this.card(row, "library", t("home_left_reading"), t("home_first_read"), t("home_first_read_line"), () =>
            void openLibrary(this.app)
        );
        this.card(row, "lightbulb", t("home_left_thought"), t("home_first_think"), t("home_first_think_line"), () =>
            this.composer?.focus()
        );
    }

    /**
     * The unfinished note (#410): when a wizard session was left mid-flow, Home offers to pick it
     * back up. One nudge — silent when there is no draft, when drafts are off, or when the canvas
     * has gone.
     */
    private renderUnfinishedNote(container: HTMLElement): void {
        const drafts = draftStore.resumable();
        const draft = drafts[0];
        if (!draft) return;
        const nudge = container.createDiv({ cls: c("home-nudge") });
        nudge.createSpan({
            cls: c("home-nudge-text"),
            text: t(
                "home_nudge_unfinished",
                draft.title.trim() || t("note_builder_draft_untitled"),
                draft.canvasPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? draft.canvasPath
            ),
        });
        const cta = nudge.createEl("button", {
            cls: c("home-nudge-cta"),
            text: t("note_builder_draft_resume"),
            attr: { "aria-label": t("note_builder_draft_resume") },
        });
        // Handled by whoever owns the wizard (the ribbon component). An import would tie the
        // Knowledge-State surface to the wizard's module graph and create a cycle.
        cta.addEventListener("click", () => this.app.workspace.trigger("zettelflow-open-flow", draft.canvasPath));
    }
}

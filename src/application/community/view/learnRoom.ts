import { getLanguage, moment as obsidianMoment, setIcon, type App, type KeymapEventHandler } from "obsidian";
import type MomentFn from "moment";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { motionWelcome } from "architecture/components/core/reader/readerMotion";
import { DOCS_SITE, docUrl, pick, type Faq, type LearnCatalog, type RefRow, type Tutorial } from "../learn/learnCatalog";
import { markSeen, newIds, readSaved, refresh, seenIds, type Freshness, type LearnLoad } from "../learn/learnSource";
import { LearnImages } from "../learn/learnImages";
import { isDone, nextUp, readProgress, ring, starters, trackProgress, withDone, withLast, type LearnProgress } from "../learn/learnProgress";
import { matchRanges, searchCatalog } from "../learn/learnSearch";
import { runDoor, type DoorRun } from "../learn/doItNow";
import type { CommunityRoomHost, RoomHandle, RoomRenderer } from "./communityRoomHost";
import { ownWindow } from "./communityPan";
import { boxOf } from "./systemShots";
import { LearnLesson, LEVEL_KEY } from "./learnLesson";
import { LEARN_SHOT, chapterTurn, flyPicture } from "./learnShots";

// Obsidian re-exports moment typed as a namespace; the callable signature, type-only.
const moment = obsidianMoment as unknown as typeof MomentFn;

/** What the room reads from the world, so a test can hand its own. */
export interface LearnRoomDeps {
    lang(): string;
    refresh(pluginVersion: string): Promise<LearnLoad>;
    images(): LearnImages;
    /** *Do it now*: the capability's own door. */
    runDoor(app: App, run: DoorRun): void;
    /** *Read the full page*: the docs site, in the browser. */
    openUrl(url: string): void;
}

const DEFAULT_DEPS: LearnRoomDeps = {
    lang: () => getLanguage(),
    refresh: (pluginVersion) => refresh(pluginVersion),
    images: () => new LearnImages(),
    runDoor,
    openUrl: (url) => void activeWindow.open(url),
};

/** The reference list's first page: the rest is one press away. */
export const REF_PAGE = 10;
/** How long a written progress waits for the next one before it reaches `data.json`. */
const SAVE_DELAY = 400;

/** What was pressed to open a lesson: the shot starts there, and Back ends there. */
interface Origin {
    tutorial: string;
    el: HTMLElement;
    /** A card's picture; a chip, a row or a button has none. */
    picture?: HTMLElement;
}

type ScopeHandler = KeymapEventHandler;

/** Whether focus is somewhere a key is typed (or a tab the nav's own arrows move). */
function typing(): boolean {
    const el = typeof activeDocument === "undefined" ? null : (activeDocument.activeElement as HTMLElement | null);
    if (!el) return false;
    const tag = (el.tagName ?? "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true || el.getAttribute?.("role") === "tab";
}

/**
 * **The Learn room** (#802, epic #797) — the place people come back to: a question they can type, how
 * far they have come, the next thing to do, and a lesson that walks them through a feature, picture by
 * picture, without leaving the leaf.
 *
 * Nothing is read or fetched until the room is **shown** (#801 FR-6). Progress is the vault's own
 * record in `data.json`, written only when you open a lesson or mark one done. Everything the
 * catalog says is drawn as text; a highlight is a `mark` around a text node, never HTML.
 */
export class LearnRoom implements RoomHandle {
    private readonly root: HTMLElement;
    private readonly home: HTMLElement;
    private readonly line: HTMLElement;
    private readonly chips: HTMLElement;
    private readonly progressEl: HTMLElement;
    private readonly body: HTMLElement;
    private readonly lookup: HTMLElement;
    private readonly faqEl: HTMLElement;
    private readonly lessonHost: HTMLElement;
    private readonly search: HTMLInputElement;
    private readonly images: LearnImages;
    private catalog: LearnCatalog | null = null;
    private progress: LearnProgress = { done: [] };
    private fresh = new Set<string>();
    private query = "";
    private group: string | null = null;
    private showAll = false;
    /** Every card drawn, by tutorial — so *Done* and *New* change in place, behind the lesson. */
    private cards = new Map<string, HTMLElement[]>();
    private bars = new Map<string, { fill: HTMLElement; count: HTMLElement }>();
    private observer: IntersectionObserver | null = null;
    private readonly lazy = new Map<Element, () => void>();
    private lesson: LearnLesson | null = null;
    private origin: Origin | null = null;
    private scrollBefore = 0;
    private busy = false;
    private closeQueued = false;
    private started = false;
    private visible = false;
    private disposed = false;
    private pendingTutorial: string | null = null;
    private slashKeys: ScopeHandler[] = [];
    private lessonKeys: ScopeHandler[] = [];
    private saveTimer: number | null = null;

    constructor(private readonly roomEl: HTMLElement, private readonly host: CommunityRoomHost, private readonly deps: LearnRoomDeps) {
        this.root = roomEl.createDiv({ cls: [c("community-room-body"), c("learn")].join(" ") });
        this.home = this.root.createDiv({ cls: c("learn-home") });
        const hero = this.home.createEl("section", { cls: c("learn-hero") });
        const ask = hero.createDiv({ cls: c("learn-ask") });
        ask.createEl("h2", { cls: c("learn-title"), text: t("learn_title") });
        ask.createEl("p", { cls: c("learn-lede"), text: t("learn_lede") });
        const label = ask.createEl("label", { cls: c("learn-search") });
        setIcon(label.createSpan({ cls: c("learn-search-icon") }), "search");
        this.search = label.createEl("input", {
            attr: { type: "search", placeholder: t("learn_search"), "aria-label": t("learn_search"), spellcheck: "false" },
        });
        label.createEl("kbd", { cls: c("learn-search-key"), text: "/", attr: { "aria-hidden": "true" } });
        this.search.addEventListener("input", () => {
            this.query = this.search.value;
            this.drawBody();
        });
        this.chips = ask.createDiv({ cls: c("learn-chips") });
        this.line = ask.createDiv({ cls: c("learn-line"), attr: { role: "status", "aria-live": "polite" } });
        this.progressEl = hero.createDiv({ cls: c("learn-progress") });
        this.progressEl.addClass("is-hidden");
        this.body = this.home.createDiv({ cls: c("learn-body") });
        this.lookup = this.home.createEl("section", { cls: c("learn-lookup") });
        this.faqEl = this.home.createEl("section", { cls: c("learn-faq") });
        this.lessonHost = this.root.createDiv({ cls: c("learn-lesson-host") });
        this.lessonHost.addClass("is-hidden");
        this.images = deps.images();
    }

    private get pluginVersion(): string {
        return this.host.plugin?.manifest?.version ?? "0.0.0";
    }

    private get lang(): string {
        return this.deps.lang();
    }

    // ── the room's handle ───────────────────────────────────────────────────────

    shown(): void {
        this.visible = true;
        this.bindSlash();
        if (this.lesson) this.bindLessonKeys();
        if (this.started) return;
        this.started = true;
        this.progress = readProgress(this.host.plugin?.settings?.learnProgress);
        // The saved copy first, at once; the network's answer replaces it in place (#801 FR-8).
        const saved = readSaved(this.pluginVersion);
        if (saved) this.draw(saved.catalog);
        else {
            this.say({ state: "fresh" }, true);
            this.drawBody();
        }
        void this.deps.refresh(this.pluginVersion).then((load) => {
            if (this.disposed) return;
            this.say(load.freshness, false);
            if (load.catalog) this.draw(load.catalog);
            else if (!this.catalog) this.drawBody();
        });
    }

    hidden(): void {
        this.visible = false;
        this.unbind(this.slashKeys);
        this.unbind(this.lessonKeys);
    }

    /** The nav's Learn count: done of the tutorials shown, once there is a catalog. */
    count(): { done: number; total: number } | null {
        return this.catalog ? ring(this.catalog, this.progress) : null;
    }

    /** A deep link names a tutorial (S6's *How to contribute*): it opens once the catalog is here. */
    applyState(state: Record<string, unknown>): void {
        if (typeof state.tutorial !== "string") return;
        this.pendingTutorial = state.tutorial;
        if (this.catalog) this.openPending();
    }

    onEscape(): boolean {
        if (!this.lesson) return false;
        void this.close();
        return true;
    }

    dispose(): void {
        this.disposed = true;
        this.hidden();
        this.lesson?.dispose();
        this.lesson = null;
        this.observer?.disconnect();
        if (this.saveTimer !== null) {
            ownWindow(this.root).clearTimeout(this.saveTimer);
            this.flushSave();
        }
        this.images.dispose();
    }

    // ── keys (FR-11, AC-5) ──────────────────────────────────────────────────────

    private bindSlash(): void {
        const scope = this.host.scope;
        if (!scope || this.slashKeys.length > 0) return;
        // `/` is Shift+7 on a Spanish keyboard: both, so it is the same key everywhere.
        const focus = () => {
            if (this.lesson || typing()) return true;
            this.search.focus();
            return false;
        };
        this.slashKeys = [scope.register([], "/", focus), scope.register(["Shift"], "/", focus)];
    }

    /** The lesson's keys, live only while it is open and in view: they never reach the editor. */
    private bindLessonKeys(): void {
        const scope = this.host.scope;
        if (!scope || this.lessonKeys.length > 0) return;
        const step = (delta: number) => () => {
            if (!this.lesson || typing()) return true;
            this.lesson.go(this.lesson.step + delta);
            return false;
        };
        this.lessonKeys = [
            scope.register([], "ArrowDown", step(1)),
            scope.register([], "ArrowRight", step(1)),
            scope.register([], "ArrowUp", step(-1)),
            scope.register([], "ArrowLeft", step(-1)),
        ];
    }

    private unbind(handlers: ScopeHandler[]): void {
        for (const handler of handlers.splice(0)) this.host.scope?.unregister(handler);
    }

    // ── the catalog ─────────────────────────────────────────────────────────────

    /** The one inline line (#801 FR-9): loading, offline, update, the empty state — never a toast. */
    private say(freshness: Freshness, loading: boolean): void {
        this.line.empty();
        this.line.removeClass("is-empty-state");
        if (loading) {
            this.line.setText(t("learn_loading"));
            return;
        }
        switch (freshness.state) {
            case "fresh":
                return;
            case "offline":
                this.line.setText(t("learn_fresh_offline", moment(freshness.savedAt).format("LL")));
                return;
            case "update-needed":
                this.line.setText(t("learn_update_needed"));
                return;
            case "empty": {
                this.line.addClass("is-empty-state");
                this.line.createEl("p", { text: t("learn_needs_connection") });
                this.line.createEl("a", { cls: c("learn-docs-link"), text: t("learn_open_docs"), href: DOCS_SITE, attr: { target: "_blank", rel: "noopener" } });
                return;
            }
        }
    }

    /** Draw the catalog, keeping the reader's place (#801 FR-8). */
    private draw(catalog: LearnCatalog): void {
        const scroll = this.roomEl.scrollTop;
        this.catalog = catalog;
        this.fresh = newIds(catalog, seenIds());
        this.drawChips();
        this.drawProgress();
        this.drawBody();
        this.drawLookup();
        this.drawFaq();
        this.roomEl.scrollTop = scroll;
        this.host.refreshCounts?.();
        this.openPending();
    }

    private openPending(): void {
        const id = this.pendingTutorial;
        if (!id || !this.catalog) return;
        this.pendingTutorial = null;
        if (this.catalog.tutorials[id]) void this.open(id);
    }

    private drawChips(): void {
        this.chips.empty();
        if (!this.catalog) return;
        for (const one of starters(this.catalog)) {
            const chip = this.chips.createEl("button", { cls: c("learn-chip"), text: pick(one.title, this.lang), attr: { type: "button", "data-tutorial": one.id } });
            chip.addEventListener("click", () => void this.open(one.id, { tutorial: one.id, el: chip }));
        }
    }

    /** The ring, *n of N*, and what is next (FR-2) — redrawn, unanimated, whenever progress changes. */
    private drawProgress(): void {
        const catalog = this.catalog;
        this.progressEl.empty();
        this.progressEl.toggleClass("is-hidden", !catalog);
        if (!catalog) return;
        const { done, total } = ring(catalog, this.progress);
        const row = this.progressEl.createDiv({ cls: c("learn-ring-row") });
        row.setCssProps({ "--zf-learn-ring": String(total > 0 ? Math.round((100 * done) / total) : 0) });
        // A round cap draws a dot even at 0 %: nothing done shows an empty ring.
        row.toggleClass("is-empty", done === 0);
        const svg = row.createSvg("svg", { cls: c("learn-ring"), attr: { viewBox: "0 0 36 36", "aria-hidden": "true" } });
        svg.createSvg("circle", { cls: c("learn-ring-track"), attr: { cx: "18", cy: "18", r: "15", pathLength: "100" } });
        svg.createSvg("circle", { cls: c("learn-ring-fill"), attr: { cx: "18", cy: "18", r: "15", pathLength: "100", transform: "rotate(-90 18 18)" } });
        const words = row.createDiv({ cls: c("learn-ring-words") });
        words.createDiv({ cls: c("learn-progress-text"), text: tCount(total, "learn_progress", String(done), String(total)) });
        words.createDiv({ cls: c("learn-progress-note"), text: t("learn_progress_note") });
        const next = nextUp(catalog, this.progress);
        const box = this.progressEl.createDiv({ cls: c("learn-next") });
        if (next.state === "all-done") {
            box.createDiv({ cls: c("learn-next-label"), text: t("learn_all_done") });
            return;
        }
        box.createDiv({ cls: c("learn-next-label"), text: next.state === "start" ? t("learn_start_here") : t("learn_pick_up") });
        const button = box.createEl("button", { cls: c("learn-next-button"), attr: { type: "button", "data-tutorial": next.tutorial.id } });
        button.createSpan({ cls: c("learn-next-title"), text: pick(next.tutorial.title, this.lang) });
        setIcon(button.createSpan({ cls: c("learn-button-icon") }), "arrow-right");
        button.addEventListener("click", () => void this.open(next.tutorial.id, { tutorial: next.tutorial.id, el: button }));
    }

    /** Tracks, or a query's results, or the room's shape while the catalog is on its way (FR-8). */
    private drawBody(): void {
        this.cards = new Map();
        this.bars = new Map();
        this.observer?.disconnect();
        this.lazy.clear();
        this.observer = this.makeObserver();
        this.body.empty();
        const query = this.query.trim();
        this.lookup.toggleClass("is-hidden", !!query || !this.catalog);
        this.faqEl.toggleClass("is-hidden", !!query || !this.catalog);
        if (!this.catalog) {
            if (this.line.hasClass("is-empty-state")) return;
            const row = this.body.createDiv({ cls: c("learn-row"), attr: { "aria-busy": "true" } });
            for (let i = 0; i < 4; i++) row.createDiv({ cls: [c("learn-card"), "is-skeleton"].join(" ") });
            return;
        }
        if (query) this.drawResults(this.catalog, query);
        else this.drawTracks(this.catalog);
    }

    private drawTracks(catalog: LearnCatalog): void {
        for (const track of catalog.tracks) {
            const section = this.body.createEl("section", { cls: c("learn-track"), attr: { "data-track": track.id } });
            const head = section.createDiv({ cls: c("learn-track-head") });
            head.createEl("h3", { cls: c("learn-track-title"), text: pick(track.title, this.lang) });
            const bar = head.createDiv({ cls: c("learn-track-bar"), attr: { "aria-hidden": "true" } });
            const fill = bar.createDiv({ cls: c("learn-track-fill") });
            const count = head.createSpan({ cls: c("learn-track-count") });
            this.bars.set(track.id, { fill, count });
            section.createEl("p", { cls: c("learn-track-blurb"), text: pick(track.blurb, this.lang) });
            const row = section.createDiv({ cls: c("learn-row") });
            for (const id of track.tutorials) {
                const tutorial = catalog.tutorials[id];
                if (tutorial) this.drawCard(row, tutorial, "");
            }
        }
        this.paintBars();
    }

    private paintBars(): void {
        const catalog = this.catalog;
        if (!catalog) return;
        for (const track of catalog.tracks) {
            const bar = this.bars.get(track.id);
            if (!bar) continue;
            const { done, total } = trackProgress(catalog, track, this.progress);
            bar.fill.setCssProps({ "--zf-learn-track": String(total > 0 ? done / total : 0) });
            bar.count.setText(t("community_learn_count", String(done), String(total)));
        }
    }

    private drawCard(parent: HTMLElement, tutorial: Tutorial, query: string): void {
        const card = parent.createEl("button", { cls: c("learn-card"), attr: { type: "button", "data-tutorial": tutorial.id } });
        const thumb = card.createDiv({ cls: c("learn-card-thumb") });
        const hero = tutorial.hero;
        if (hero) this.later(thumb, () => this.images.frame(thumb, hero, ""));
        const text = card.createDiv({ cls: c("learn-card-body") });
        highlight(text.createDiv({ cls: c("learn-tutorial-title") }), pick(tutorial.title, this.lang), query);
        highlight(text.createEl("p", { cls: c("learn-card-summary") }), pick(tutorial.summary, this.lang), query);
        const meta = text.createDiv({ cls: c("learn-card-meta") });
        meta.createSpan({ text: t("learn_minutes", String(tutorial.minutes)) });
        meta.createSpan({ text: t(LEVEL_KEY[tutorial.level]) });
        this.cards.set(tutorial.id, [...(this.cards.get(tutorial.id) ?? []), card]);
        this.paintCard(card, tutorial.id);
        card.addEventListener("click", () => void this.open(tutorial.id, { tutorial: tutorial.id, el: card, picture: thumb }));
    }

    /** *Done* and *New* on a card. Done wins: a tutorial done elsewhere is not new here. */
    private paintCard(card: HTMLElement, id: string): void {
        const done = isDone(this.progress, id);
        card.toggleClass("is-done", done);
        const thumb = card.querySelector<HTMLElement>(`.${c("learn-card-thumb")}`);
        const meta = card.querySelector<HTMLElement>(`.${c("learn-card-meta")}`);
        thumb?.querySelector(`.${c("learn-new")}`)?.remove();
        meta?.querySelector(`.${c("learn-card-done")}`)?.remove();
        if (this.fresh.has(id) && !done) thumb?.createSpan({ cls: c("learn-new"), text: t("learn_new") });
        if (done && meta) {
            const mark = meta.createSpan({ cls: c("learn-card-done") });
            setIcon(mark.createSpan({ cls: c("learn-button-icon") }), "check");
            mark.createSpan({ text: t("learn_done") });
        }
    }

    private drawResults(catalog: LearnCatalog, query: string): void {
        const found = searchCatalog(catalog, query, this.lang);
        if (found.tutorials.length + found.reference.length + found.faq.length === 0) {
            const none = this.body.createDiv({ cls: c("learn-no-match"), attr: { role: "status" } });
            none.createEl("p", { text: t("community_systems_no_match", query) });
            const clear = none.createEl("button", { text: t("community_systems_clear_search"), attr: { type: "button" } });
            clear.addEventListener("click", () => {
                this.search.value = "";
                this.query = "";
                this.drawBody();
                this.search.focus();
            });
            return;
        }
        const group = (key: "learn_results_tutorials" | "learn_results_reference" | "learn_results_questions", n: number) => {
            const section = this.body.createEl("section", { cls: c("learn-results-group") });
            section.createEl("h4", { cls: c("learn-results-title"), text: t(key, String(n)) });
            return section;
        };
        if (found.tutorials.length > 0) {
            const grid = group("learn_results_tutorials", found.tutorials.length).createDiv({ cls: c("learn-results-grid") });
            for (const tutorial of found.tutorials) this.drawCard(grid, tutorial, query);
        }
        if (found.reference.length > 0) {
            const list = group("learn_results_reference", found.reference.length).createDiv({ cls: c("learn-ref") });
            for (const row of found.reference) this.drawRef(list, row, query);
        }
        if (found.faq.length > 0) {
            const list = group("learn_results_questions", found.faq.length).createDiv({ cls: c("learn-faq-list") });
            for (const entry of found.faq) this.drawQuestion(list, entry, query, true);
        }
    }

    /** *Look anything up* (FR-5): every row, by group, ten at a time. */
    private drawLookup(): void {
        const catalog = this.catalog;
        this.lookup.empty();
        if (!catalog || catalog.reference.length === 0) return;
        this.lookup.createEl("h3", { cls: c("learn-section-title"), text: t("learn_lookup") });
        const groups = [...new Set(catalog.reference.map((row) => pick(row.group, this.lang)))];
        if (this.group !== null && !groups.includes(this.group)) this.group = null;
        const chips = this.lookup.createDiv({ cls: c("learn-groups") });
        for (const name of [null, ...groups]) {
            const chip = chips.createEl("button", {
                cls: c("learn-group"),
                text: name ?? t("learn_group_all"),
                attr: { type: "button", "aria-pressed": this.group === name ? "true" : "false" },
            });
            chip.toggleClass("is-active", this.group === name);
            chip.addEventListener("click", () => {
                this.group = name;
                this.showAll = false;
                this.drawLookup();
            });
        }
        const rows = catalog.reference.filter((row) => this.group === null || pick(row.group, this.lang) === this.group);
        const list = this.lookup.createDiv({ cls: c("learn-ref") });
        for (const row of this.showAll ? rows : rows.slice(0, REF_PAGE)) this.drawRef(list, row, "");
        if (!this.showAll && rows.length > REF_PAGE) {
            const more = this.lookup.createEl("button", { cls: c("learn-show-all"), text: t("learn_show_all", String(rows.length)), attr: { type: "button" } });
            more.addEventListener("click", () => {
                this.showAll = true;
                this.drawLookup();
            });
        }
    }

    /** A reference row opens its tutorial when it has one, else its docs page in the browser (FR-5). */
    private drawRef(parent: HTMLElement, row: RefRow, query: string): void {
        const tutorial = row.tutorial && this.catalog?.tutorials[row.tutorial] ? row.tutorial : null;
        const url = row.doc ? docUrl(row.doc) : null;
        const el = tutorial || url ? parent.createEl("button", { cls: c("learn-ref-row"), attr: { type: "button" } }) : parent.createDiv({ cls: c("learn-ref-row") });
        highlight(el.createSpan({ cls: c("learn-ref-name") }), pick(row.name, this.lang), query);
        highlight(el.createSpan({ cls: c("learn-ref-line") }), pick(row.line, this.lang), query);
        highlight(el.createSpan({ cls: c("learn-ref-door") }), pick(row.door, this.lang), query);
        const go = el.createSpan({ cls: c("learn-ref-go"), attr: { "aria-hidden": "true" } });
        if (tutorial) {
            setIcon(go, "arrow-right");
            el.setAttribute("data-tutorial-ref", tutorial);
            el.addEventListener("click", () => void this.open(tutorial, { tutorial, el }));
        } else if (url) {
            setIcon(go, "external-link");
            el.addEventListener("click", () => this.deps.openUrl(url));
        }
    }

    private drawFaq(): void {
        const catalog = this.catalog;
        this.faqEl.empty();
        if (!catalog || catalog.faq.length === 0) return;
        this.faqEl.createEl("h3", { cls: c("learn-section-title"), text: t("learn_faq") });
        const list = this.faqEl.createDiv({ cls: c("learn-faq-list") });
        for (const entry of catalog.faq) this.drawQuestion(list, entry, "", false);
    }

    private drawQuestion(parent: HTMLElement, entry: Faq, query: string, open: boolean): void {
        const details = parent.createEl("details", { cls: c("learn-faq-item") });
        const summary = details.createEl("summary", { cls: c("learn-faq-q") });
        setIcon(summary.createSpan({ cls: c("learn-faq-icon") }), "chevron-right");
        highlight(summary.createSpan(), pick(entry.q, this.lang), query);
        highlight(details.createEl("p", { cls: c("learn-faq-a") }), pick(entry.a, this.lang), query);
        details.open = open;
    }

    /** Pictures load as their cards come into view (the Systems room's covers), each once. */
    private makeObserver(): IntersectionObserver | null {
        const Observer = (ownWindow(this.roomEl) as Window & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
        if (!Observer) return null;
        return new Observer(
            (seen) => {
                for (const sight of seen) {
                    if (!sight.isIntersecting) continue;
                    this.observer?.unobserve(sight.target);
                    const load = this.lazy.get(sight.target);
                    this.lazy.delete(sight.target);
                    load?.();
                }
            },
            { root: this.roomEl, rootMargin: "200px" }
        );
    }

    private later(el: HTMLElement, load: () => void): void {
        if (!this.observer) {
            load();
            return;
        }
        this.lazy.set(el, load);
        this.observer.observe(el);
    }

    // ── progress (FR-12) ────────────────────────────────────────────────────────

    private setProgress(progress: LearnProgress): void {
        this.progress = progress;
        const settings = this.host.plugin?.settings;
        if (!settings) return;
        settings.learnProgress = progress.last ? { done: [...progress.done], last: progress.last } : { done: [...progress.done] };
        const win = ownWindow(this.root);
        if (this.saveTimer !== null) win.clearTimeout(this.saveTimer);
        this.saveTimer = win.setTimeout(() => this.flushSave(), SAVE_DELAY);
    }

    private flushSave(): void {
        this.saveTimer = null;
        void this.host.plugin?.saveSettings?.();
    }

    /** Marked done or not: the ring, the bars and every card follow at once, unanimated. */
    private setDone(id: string, done: boolean): void {
        this.setProgress(withDone(this.progress, id, done));
        this.repaintProgress();
    }

    private repaintProgress(): void {
        this.drawProgress();
        this.paintBars();
        for (const [id, cards] of this.cards) for (const card of cards) this.paintCard(card, id);
        this.host.refreshCounts?.();
    }

    /** Opened: the last one opened, and no longer *New*. */
    private opened(id: string): void {
        this.setProgress(withLast(this.progress, id));
        if (this.fresh.delete(id)) markSeen(id);
        this.repaintProgress();
    }

    // ── the lesson (FR-9–FR-11) ─────────────────────────────────────────────────

    /** The lesson in view, if any — for the view, and for tests. */
    get openLesson(): LearnLesson | null {
        return this.lesson;
    }

    private mountLesson(tutorial: Tutorial, waiting: boolean): LearnLesson {
        const lesson = new LearnLesson(this.lessonHost, tutorial, {
            catalog: this.catalog as LearnCatalog,
            lang: this.lang,
            images: this.images,
            waiting,
            isDone: (id) => isDone(this.progress, id),
            onBack: () => void this.close(),
            onToggleDone: (id, done) => this.setDone(id, done),
            onDoIt: (run) => this.deps.runDoor(this.host.app, run),
            onReadDoc: (url) => this.deps.openUrl(url),
            onOpen: (id) => void this.turnTo(id),
        });
        this.lesson = lesson;
        return lesson;
    }

    /**
     * Open a tutorial in place: the pressed card's picture grows into the stage and becomes it (or,
     * from a chip, a row or a result, the picture grows out of what was pressed).
     */
    async open(id: string, origin?: Origin): Promise<void> {
        const tutorial = this.catalog?.tutorials[id];
        if (!tutorial || this.busy || this.disposed) return;
        if (this.lesson) return this.turnTo(id);
        this.busy = true;
        try {
            const from = origin ? boxOf(origin.picture ?? origin.el) : null;
            this.origin = origin ?? null;
            this.scrollBefore = this.roomEl.scrollTop;
            this.home.addClass("is-hidden");
            this.lessonHost.removeClass("is-hidden");
            const lesson = this.mountLesson(tutorial, true);
            this.roomEl.scrollTop = 0;
            this.opened(id);
            if (this.visible) this.bindLessonKeys();
            const src = await this.pictureOf(tutorial);
            // Closed, or turned to another, while its picture loaded.
            if (this.openLesson !== lesson) return;
            await flyPicture(this.shotHost(), src, from, lesson.stageBox(), LEARN_SHOT.open, () => lesson.landed());
        } finally {
            this.settle();
        }
    }

    /** *Up next* or *Related*: the next lesson slides in like a chapter; Back still goes to the room. */
    async turnTo(id: string): Promise<void> {
        const tutorial = this.catalog?.tutorials[id];
        const before = this.lesson;
        if (!tutorial || !before || this.busy || before.tutorial.id === id) return;
        this.busy = true;
        try {
            this.opened(id);
            const next = this.mountLesson(tutorial, false);
            this.roomEl.scrollTop = 0;
            before.dispose();
            await chapterTurn(before.el, next.el);
        } finally {
            this.settle();
        }
    }

    /** Back, or Esc: the picture flies home onto its card, scrolled into view first; the room is as it was. */
    async close(): Promise<void> {
        const lesson = this.lesson;
        if (!lesson) return;
        // Esc or Back in the middle of a shot: the key has already jumped the shot to its end, so the
        // lesson closes the moment it lands — a press is never lost.
        if (this.busy) {
            this.closeQueued = true;
            return;
        }
        this.busy = true;
        try {
            const from = lesson.stageBox();
            const tutorial = lesson.tutorial;
            this.unbind(this.lessonKeys);
            lesson.dispose();
            this.lesson = null;
            this.lessonHost.empty();
            this.lessonHost.addClass("is-hidden");
            this.home.removeClass("is-hidden");
            this.roomEl.scrollTop = this.scrollBefore;
            const target = this.homeOf(tutorial.id);
            this.origin = null;
            if (!target) return;
            target.el.scrollIntoView({ block: "nearest", inline: "nearest" });
            const src = await this.pictureOf(tutorial);
            target.picture?.addClass("is-travelling");
            await flyPicture(this.shotHost(), src, from, boxOf(target.picture ?? target.el), LEARN_SHOT.close, () => target.picture?.removeClass("is-travelling"));
            target.el.focus();
        } finally {
            this.settle();
        }
    }

    /** A shot has landed: the next may start, and a Back pressed while it flew goes now. */
    private settle(): void {
        this.busy = false;
        if (!this.closeQueued) return;
        this.closeQueued = false;
        if (this.lesson && !this.disposed) void this.close();
    }

    /**
     * Where Back lands: the card of the lesson open now when the lesson came from a card, or was
     * turned to another one; otherwise the chip, row or button that was pressed.
     */
    private homeOf(id: string): { el: HTMLElement; picture?: HTMLElement } | null {
        const origin = this.origin;
        if (origin && !origin.picture && origin.tutorial === id && origin.el.isConnected) return { el: origin.el };
        const card = (this.cards.get(id) ?? []).find((one) => one.isConnected);
        if (!card) return origin?.el.isConnected ? { el: origin.el } : null;
        return { el: card, picture: card.querySelector<HTMLElement>(`.${c("learn-card-thumb")}`) ?? undefined };
    }

    /** The picture a flight carries, if it is here in time — a shot never waits on the network. */
    private async pictureOf(tutorial: Tutorial): Promise<string | null> {
        const hero = tutorial.hero ?? tutorial.steps.find((step) => step.image)?.image;
        if (!hero || !motionWelcome(this.root)) return null;
        const win = ownWindow(this.root);
        return Promise.race([this.images.url(hero), new Promise<null>((resolve) => win.setTimeout(() => resolve(null), LEARN_SHOT.picture))]);
    }

    /** What the shots fly over: the whole Community view. */
    private shotHost(): HTMLElement {
        return this.roomEl.closest<HTMLElement>(`.${c("community")}`) ?? this.root;
    }
}

/**
 * `text`, with every match of `query` in a `mark` (FR-7): text nodes and elements only, built from
 * {@link matchRanges} — never HTML, whatever the catalog says.
 */
export function highlight(el: HTMLElement, text: string, query: string): void {
    const ranges = query ? matchRanges(text, query) : [];
    if (ranges.length === 0) {
        el.setText(text);
        return;
    }
    el.empty();
    let at = 0;
    for (const [start, end] of ranges) {
        if (start > at) el.appendText(text.slice(at, start));
        el.createEl("mark", { cls: c("learn-hit"), text: text.slice(start, end) });
        at = end;
    }
    if (at < text.length) el.appendText(text.slice(at));
}

export function learnRoom(deps: Partial<LearnRoomDeps> = {}): RoomRenderer {
    return { mount: (el, host) => new LearnRoom(el, host, { ...DEFAULT_DEPS, ...deps }) };
}

export const LEARN_ROOM: RoomRenderer = learnRoom();

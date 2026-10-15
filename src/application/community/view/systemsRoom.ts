import { Notice, TFile, getLanguage, parseYaml, setIcon } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { UNDO_OFFER_MS, offerState } from "application/writes/undoOffer";
import type { StaticTemplateOptions } from "config";
import type { ZfTemplate } from "application/template/zfTemplate";
import {
    fetchActionTemplate,
    fetchCommunityTemplates,
    fetchMarkdownTemplate,
    fetchStepTemplate,
    fetchSystemTemplate,
} from "../services/CommunityHttpClientService";
import { drawingOf, type SystemDrawing } from "../systemDrawing";
import type { ParseYaml } from "../templateGraph";
import { groupSystems, matchesQuery, summaryOf } from "../systemsCatalog";
import { installsOf, type InstalledSystem } from "../installRecord";
import { takeBackInstall } from "../removeInstall";
import type { InstallRole } from "../installDestination";
import { RUNS_KEY } from "../installConsequence";
import type { CommunityRoomHost, RoomHandle, RoomRenderer } from "./communityRoomHost";
import { ownWindow } from "./communityPan";
import { drawSystem } from "./systemDrawingView";
import { SystemPanel, difficultyDots, stepsText } from "./systemPanel";
import { SHOT, boxOf, flyDrawing } from "./systemShots";

type LocaleKey = Parameters<typeof t>[0];

/** What the room reads from the world — the network and the YAML parser — so a test can hand its own. */
export interface SystemsRoomDeps {
    fetchCatalog(): Promise<StaticTemplateOptions[]>;
    fetchTemplate(ref: string): Promise<ZfTemplate>;
    parseYaml: ParseYaml;
    lang(): string;
}

const DEFAULT_DEPS: SystemsRoomDeps = {
    fetchCatalog: fetchCommunityTemplates,
    fetchTemplate: fetchSystemTemplate,
    parseYaml: (yaml) => parseYaml(yaml) as unknown,
    lang: () => getLanguage(),
};

/** A card and what it knows: its row, its template once fetched, its drawing once drawn. */
interface Card {
    entry: StaticTemplateOptions;
    el: HTMLElement;
    thumb: HTMLElement;
    template?: ZfTemplate;
    drawing?: SystemDrawing;
    failed?: boolean;
    loading?: Promise<void>;
}

/**
 * The loose pieces' install dialogs, opened as they always were (FR-5). Loaded when a piece is
 * chosen: they bring the step editor with them, and the room should not wait on it to draw.
 */
async function openPiece(host: CommunityRoomHost, entry: StaticTemplateOptions, redraw: () => void): Promise<void> {
    const { plugin } = host;
    switch (entry.template_type) {
        case "step": {
            const { CommunityStepModal } = await import("../CommunityStepModal");
            new CommunityStepModal(plugin, await fetchStepTemplate(entry.ref), redraw).open();
            return;
        }
        case "action": {
            const { CommunityActionModal } = await import("../CommunityActionModal");
            new CommunityActionModal(plugin, await fetchActionTemplate(entry.ref)).open();
            return;
        }
        case "markdown": {
            const { CommunityMarkdownModal } = await import("../CommunityMarkdownModal");
            const filename = entry.ref.split("/").pop() ?? `${entry.title}.md`;
            new CommunityMarkdownModal(plugin, await fetchMarkdownTemplate(entry.ref), entry.title, entry.description, filename).open();
            return;
        }
        default:
            return;
    }
}

const PIECE_KIND_KEY: Record<string, LocaleKey> = {
    step: "community_templates_type_step",
    action: "community_templates_type_action",
    markdown: "community_templates_type_markdown",
};

/**
 * **The Systems room** (#799, epic #797): the whole adoption path in one shot.
 *
 * You read a card's drawing — the system's own canvas, at a glance — open it in place and walk it
 * on the drawing, say how you will use it, read exactly what will happen and press Install. The
 * drawing then becomes the canvas in this same tab, and the notice offers *Undo* right there. No
 * filter, no second modal, no confirmation dialog.
 */
export class SystemsRoom implements RoomHandle {
    private readonly root: HTMLElement;
    private readonly list: HTMLElement;
    private readonly body: HTMLElement;
    private readonly openEl: HTMLElement;
    private search!: HTMLInputElement;
    private catalog: StaticTemplateOptions[] | null = null;
    private loadingCatalog: Promise<void> | null = null;
    private readonly cards = new Map<string, Card>();
    private observer: IntersectionObserver | null = null;
    private panel: SystemPanel | null = null;
    private openRef: string | null = null;
    private scrollBefore = 0;
    private busy = false;
    /** Set the moment the tab becomes a canvas: the history entry *Back* returns to carries it. */
    private leaving: string | null = null;
    private disposed = false;

    constructor(private readonly roomEl: HTMLElement, private readonly host: CommunityRoomHost, private readonly deps: SystemsRoomDeps) {
        this.root = roomEl.createDiv({ cls: c("systems") });
        this.list = this.root.createDiv({ cls: [c("community-room-body"), c("systems-list")].join(" ") });
        const head = this.list.createDiv({ cls: c("systems-head") });
        head.createEl("p", { cls: c("systems-lede"), text: t("community_systems_lede") });
        const label = head.createEl("label", { cls: c("systems-search") });
        setIcon(label.createSpan({ cls: c("systems-search-icon") }), "search");
        this.search = label.createEl("input", {
            attr: { type: "search", placeholder: t("community_systems_search"), "aria-label": t("community_systems_search"), spellcheck: "false" },
        });
        this.search.addEventListener("input", () => this.filter());
        this.body = this.list.createDiv({ cls: c("systems-body") });
        this.openEl = this.root.createDiv({ cls: [c("community-room-body"), c("systems-open-host")].join(" ") });
        this.openEl.addClass("is-hidden");
        void this.load();
    }

    // ── the catalog ─────────────────────────────────────────────────────────────

    /** Fetch the catalog and draw the room; a failure is said here, with *Try again* — never a toast. */
    load(): Promise<void> {
        this.body.empty();
        const skeletons = this.body.createDiv({ cls: c("systems-grid"), attr: { "aria-busy": "true" } });
        for (let i = 0; i < 6; i++) skeletons.createDiv({ cls: [c("system-card"), "is-skeleton"].join(" ") });
        this.loadingCatalog = this.deps
            .fetchCatalog()
            .then((entries) => {
                if (this.disposed) return;
                this.catalog = entries;
                this.drawCatalog();
            })
            .catch((error) => {
                log.warn("[gallery] the catalog could not be fetched", error);
                if (this.disposed) return;
                this.body.empty();
                const state = this.body.createDiv({ cls: c("systems-state"), attr: { role: "status" } });
                state.createEl("p", { text: t("community_systems_unreachable") });
                const retry = state.createEl("button", { cls: "mod-cta", text: t("community_systems_try_again"), attr: { type: "button" } });
                retry.addEventListener("click", () => void this.load());
            });
        return this.loadingCatalog;
    }

    private drawCatalog(): void {
        const entries = this.catalog ?? [];
        this.body.empty();
        this.cards.clear();
        this.observer?.disconnect();
        this.observer = this.makeObserver();
        const groups = groupSystems(entries);
        for (const [key, why, list] of [
            ["community_systems_methods", "community_systems_methods_why", groups.methods],
            ["community_systems_single", "community_systems_single_why", groups.single],
        ] as const) {
            if (list.length === 0) continue;
            const section = this.body.createEl("section", { cls: c("systems-group") });
            section.createEl("h3", { cls: c("systems-group-title"), text: t(key) });
            section.createEl("p", { cls: c("systems-group-why"), text: t(why) });
            const grid = section.createDiv({ cls: c("systems-grid") });
            for (const entry of list) this.drawCard(grid, entry);
        }
        const none = this.body.createDiv({ cls: c("systems-no-match"), attr: { role: "status" } });
        none.addClass("is-hidden");
        if (groups.loose.length > 0) this.drawLoose(groups.loose);
        this.filter();
        this.host.refreshCounts?.();
    }

    private drawCard(grid: HTMLElement, entry: StaticTemplateOptions): void {
        const el = grid.createEl("button", { cls: c("system-card"), attr: { type: "button", "data-ref": entry.ref } });
        const thumb = el.createDiv({ cls: [c("system-card-thumb"), "is-loading"].join(" ") });
        this.markInVault(thumb, entry.ref);
        const text = el.createDiv({ cls: c("system-card-body") });
        text.createDiv({ cls: c("system-card-title"), text: entry.title });
        text.createEl("p", { cls: c("system-card-summary"), text: summaryOf(entry, this.deps.lang()) });
        const meta = text.createDiv({ cls: c("system-card-meta") });
        difficultyDots(meta, entry.difficulty);
        meta.createSpan({ text: stepsText(entry.steps, entry.branches) });
        const card: Card = { entry, el, thumb };
        this.cards.set(entry.ref, card);
        el.addEventListener("click", () => void this.open(entry.ref));
        if (this.observer) this.observer.observe(thumb);
        else void this.loadTemplate(card);
    }

    /**
     * *In your vault*, as the install record says now: added or taken off without touching the
     * drawing. Installed's *Remove* changes the record while this room is out of view (#804).
     */
    private markInVault(thumb: HTMLElement, ref: string): void {
        const inVault = installsOf(this.host.plugin.settings.installedSystems, ref).length > 0;
        const badge = thumb.querySelector(`.${c("system-card-installed")}`);
        if (!inVault) {
            badge?.remove();
            return;
        }
        if (badge) return;
        const made = thumb.createSpan({ cls: c("system-card-installed") });
        setIcon(made.createSpan({ cls: c("system-card-installed-icon") }), "check");
        made.createSpan({ text: t("community_systems_in_vault") });
        thumb.prepend(made);
    }

    /** Templates are fetched as their cards come into view (the Library's covers), each once. */
    private makeObserver(): IntersectionObserver | null {
        const Observer = (ownWindow(this.roomEl) as Window & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
        if (!Observer) return null;
        return new Observer(
            (seen) => {
                for (const sight of seen) {
                    if (!sight.isIntersecting) continue;
                    this.observer?.unobserve(sight.target);
                    const card = [...this.cards.values()].find((one) => one.thumb === sight.target);
                    if (card) void this.loadTemplate(card);
                }
            },
            { root: this.roomEl, rootMargin: "200px" }
        );
    }

    /** One card's template and drawing. A failure leaves the card without a drawing, and says why when opened. */
    private loadTemplate(card: Card): Promise<void> {
        if (card.template) return Promise.resolve();
        if (card.loading) return card.loading;
        card.failed = false;
        card.loading = this.deps
            .fetchTemplate(card.entry.ref)
            .then((template) => {
                card.template = template;
                try {
                    card.drawing = drawingOf(template, this.deps.parseYaml);
                } catch (error) {
                    log.warn("[gallery] could not draw this system", card.entry.ref, error);
                }
                if (card.drawing && !this.disposed) drawSystem(card.thumb, card.drawing, "thumb");
            })
            .catch((error) => {
                log.warn("[gallery] the system could not be fetched", card.entry.ref, error);
                card.failed = true;
                card.thumb.addClass("is-missing");
            })
            .finally(() => {
                card.loading = undefined;
                card.thumb.removeClass("is-loading");
            });
        return card.loading;
    }

    private drawLoose(pieces: StaticTemplateOptions[]): void {
        const details = this.body.createEl("details", { cls: c("systems-loose") });
        const summary = details.createEl("summary", { cls: c("systems-loose-summary") });
        setIcon(summary.createSpan({ cls: c("systems-loose-icon") }), "chevron-right");
        summary.createSpan({ text: tCount(pieces.length, "community_systems_loose", String(pieces.length)) });
        const list = details.createEl("ul", { cls: c("systems-loose-list") });
        const status = details.createDiv({ cls: c("systems-loose-status"), attr: { role: "status" } });
        for (const piece of pieces) {
            const item = list.createEl("li");
            const button = item.createEl("button", { cls: c("systems-piece"), attr: { type: "button", "data-ref": piece.ref } });
            const kind = PIECE_KIND_KEY[piece.template_type];
            if (kind) button.createSpan({ cls: c("systems-piece-kind"), text: t(kind) });
            button.createSpan({ cls: c("systems-piece-name"), text: piece.title });
            button.createSpan({ cls: c("systems-piece-desc"), text: piece.description });
            button.addEventListener("click", () => {
                status.setText("");
                openPiece(this.host, piece, () => this.host.refreshCounts?.()).catch((error) => {
                    log.error(`Error opening the ${piece.template_type} template:`, error);
                    status.setText(t("community_templates_open_failed", piece.title));
                });
            });
        }
    }

    /** Search is the only control: cards that do not answer go, and a group with none goes with them. */
    private filter(): void {
        const query = this.search.value;
        const lang = this.deps.lang();
        let shown = 0;
        for (const card of this.cards.values()) {
            const match = matchesQuery(card.entry, query, lang);
            card.el.toggleClass("is-hidden", !match);
            if (match) shown++;
        }
        for (const section of Array.from(this.body.querySelectorAll(`.${c("systems-group")}`))) {
            const visible = Array.from(section.querySelectorAll(`.${c("system-card")}`)).some((card) => !card.hasClass("is-hidden"));
            section.toggleClass("is-hidden", !visible);
        }
        const none = this.body.querySelector<HTMLElement>(`.${c("systems-no-match")}`);
        if (!none) return;
        none.empty();
        const nothing = shown === 0 && this.cards.size > 0 && query.trim() !== "";
        none.toggleClass("is-hidden", !nothing);
        if (!nothing) return;
        none.createEl("p", { text: t("community_systems_no_match", query.trim()) });
        const clear = none.createEl("button", { text: t("community_systems_clear_search"), attr: { type: "button" } });
        clear.addEventListener("click", () => {
            this.search.value = "";
            this.filter();
            this.search.focus();
        });
    }

    // ── a system, open in place ─────────────────────────────────────────────────

    /** The card's drawing grows into the stage; the list steps aside until you come back. */
    async open(ref: string): Promise<void> {
        const card = this.cards.get(ref);
        if (!card || this.panel || this.busy) return;
        this.busy = true;
        try {
            await this.loadTemplate(card);
            if (this.disposed) return;
            const from = boxOf(card.thumb);
            this.scrollBefore = this.roomEl.scrollTop;
            this.list.addClass("is-hidden");
            this.openEl.removeClass("is-hidden");
            this.openRef = ref;
            this.panel = new SystemPanel(this.openEl, {
                host: this.host,
                entry: card.entry,
                template: card.template ?? null,
                drawing: card.drawing ?? null,
                parseYaml: this.deps.parseYaml,
                lang: this.deps.lang(),
                onBack: () => void this.close(),
                onRetry: () => void this.retry(ref),
                onInstalled: (outcome, role) => void this.land(outcome.record, outcome.canvasPath, role),
            });
            this.roomEl.scrollTop = 0;
            const panel = this.panel;
            if (card.drawing) {
                card.thumb.addClass("is-travelling");
                await flyDrawing(this.shotHost(), card.drawing, from, panel.stageBox(), SHOT.open, () => panel.landed());
                card.thumb.removeClass("is-travelling");
            }
            panel.el.addClass("is-arrived");
        } finally {
            this.busy = false;
        }
    }

    private async retry(ref: string): Promise<void> {
        await this.close(true);
        await this.open(ref);
    }

    /** Back, or Esc: the drawing flies home onto its card, which is scrolled into view first. */
    async close(instant = false): Promise<void> {
        const panel = this.panel;
        const ref = this.openRef;
        if (!panel || this.busy) return;
        this.busy = true;
        try {
            const card = ref ? this.cards.get(ref) : undefined;
            const from = panel.stageBox();
            const drawing = card?.drawing;
            panel.dispose();
            this.panel = null;
            this.openRef = null;
            this.openEl.addClass("is-hidden");
            this.list.removeClass("is-hidden");
            this.roomEl.scrollTop = this.scrollBefore;
            if (!card || !drawing || instant) return;
            card.el.scrollIntoView({ block: "nearest", inline: "nearest" });
            card.thumb.addClass("is-travelling");
            await flyDrawing(this.shotHost(), drawing, from, boxOf(card.thumb), SHOT.close, () => card.thumb.removeClass("is-travelling"));
            card.el.focus();
        } finally {
            this.busy = false;
        }
    }

    /**
     * Installed: the stage's drawing grows to fill the tab, and **the tab becomes the canvas** — the
     * Community leaf opens it, so Obsidian's *Back* comes home to Systems. Then the notice says it
     * is in your vault and how it runs, with *Create a note* and *Undo*.
     */
    private async land(record: InstalledSystem, canvasPath: string, role: InstallRole): Promise<void> {
        const panel = this.panel;
        const card = this.openRef ? this.cards.get(this.openRef) : undefined;
        this.busy = true;
        try {
            if (panel && card?.drawing) {
                await flyDrawing(this.shotHost(), card.drawing, panel.stageBox(), boxOf(this.leafBox()), SHOT.land, () => undefined);
            }
            const file = this.host.app.vault.getFileByPath(canvasPath);
            this.leaving = record.ref;
            if (file instanceof TFile) await this.host.leaf.openFile(file);
        } catch (error) {
            log.error("[gallery] could not open the installed canvas", error);
        } finally {
            this.busy = false;
        }
        announceInstalled(this.host, record, canvasPath, role);
    }

    /** What the shots fly over: the whole Community view, so a ghost can cross from a room to the tab. */
    private shotHost(): HTMLElement {
        return this.roomEl.closest<HTMLElement>(`.${c("community")}`) ?? this.root;
    }

    /** The tab's box: what the drawing fills before the tab becomes the canvas. */
    private leafBox(): HTMLElement {
        return this.shotHost();
    }

    /**
     * *Back* from the canvas: the tab's drawing flies home to its card (FR-13). The card may not be
     * drawn yet — the catalog is fetched again for this new view — so it waits for it, briefly.
     */
    async flyHome(ref: string): Promise<void> {
        await this.loadingCatalog;
        const card = this.cards.get(ref);
        if (!card || this.disposed) return;
        await this.loadTemplate(card);
        if (!card.drawing) return;
        card.el.scrollIntoView({ block: "nearest", inline: "nearest" });
        card.thumb.addClass("is-travelling");
        await flyDrawing(this.shotHost(), card.drawing, boxOf(this.leafBox()), boxOf(card.thumb), SHOT.home, () => card.thumb.removeClass("is-travelling"));
    }

    // ── the room's handle ───────────────────────────────────────────────────────

    /** The camera has arrived: the badges follow the record, which another room may have changed. */
    shown(): void {
        for (const card of this.cards.values()) this.markInVault(card.thumb, card.entry.ref);
    }

    count(): number | null {
        if (!this.catalog) return null;
        return this.catalog.filter((entry) => entry.template_type === "system").length;
    }

    viewState(): Record<string, unknown> {
        return this.leaving ? { flyHome: this.leaving } : {};
    }

    applyState(state: Record<string, unknown>): void {
        if (typeof state.flyHome === "string") void this.flyHome(state.flyHome);
    }

    onEscape(): boolean {
        if (!this.panel) return false;
        void this.close();
        return true;
    }

    /** Which system is open, if any — for the view, and for tests. */
    get opened(): SystemPanel | null {
        return this.panel;
    }

    dispose(): void {
        this.disposed = true;
        this.observer?.disconnect();
        this.panel?.dispose();
        this.panel = null;
        this.root.remove();
    }
}

/**
 * The notice after an install (FR-13, FR-15): it says the system is in your vault and how it runs,
 * offers to create a note now where the role can, and *Undo* — the exact take-back, for as long as
 * the notice lives.
 */
export function announceInstalled(host: CommunityRoomHost, record: InstalledSystem, canvasPath: string, role: InstallRole): void {
    const notice = new Notice("", UNDO_OFFER_MS);
    const offeredAt = Date.now();
    const fragment = createFragment();
    const wrapper = fragment.createDiv({ cls: c("system-notice") });
    wrapper.createEl("b", { text: t("community_installed_notice", record.name) });
    wrapper.createDiv({ text: t(RUNS_KEY[role] as LocaleKey) });
    const row = wrapper.createDiv({ cls: c("system-notice-row") });
    if (role === "create" || role === "none") {
        const create = row.createEl("button", { cls: "mod-cta", text: t("community_create_a_note"), attr: { type: "button" } });
        create.addEventListener("click", () => {
            notice.hide();
            host.app.workspace.trigger("zettelflow-open-flow", canvasPath);
        });
    }
    const undo = row.createEl("button", { text: t("changes_undo"), attr: { type: "button" } });
    undo.addEventListener("click", () => {
        notice.hide();
        if (offerState(offeredAt, Date.now()) === "expired") return;
        void takeBackInstall(host.plugin, record, host.leaf).then((result) => {
            const done = result.removed.length + (result.settingRestored ? 1 : 0);
            const left = [...result.kept, ...result.failed];
            new Notice(
                left.length > 0
                    ? t("changes_undo_partial_done", String(done), left.join(", "))
                    : tCount(done, "changes_undo_done", String(done))
            );
        });
    });
    notice.setMessage(fragment);
}

/** The Systems room, as Community mounts it. */
export function systemsRoom(deps: Partial<SystemsRoomDeps> = {}): RoomRenderer {
    return {
        mount(el, host) {
            return new SystemsRoom(el, host, { ...DEFAULT_DEPS, ...deps });
        },
    };
}

export const SYSTEMS_ROOM = systemsRoom();

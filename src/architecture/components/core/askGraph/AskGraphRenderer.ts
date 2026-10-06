import { App, Menu, Notice, setIcon, type Scope } from "obsidian";
import { c, ObsidianApi, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    answerFunnel,
    asSelection,
    build3DGraph,
    deriveFacets,
    explainEmpty,
    invertTerm,
    matchesFor,
    regionBasename,
    rowFacts,
    runGraphQuery,
    toQuery,
    toggleTerm,
    tourStops,
    wordsToTerms,
    type AskVocabulary,
    type Facet,
    type FacetId,
    type FacetValue,
    type FunnelStep,
    type Graph3DData,
    type GraphQueryResult,
    type RowFact,
} from "architecture/knowledge/state";
import { makeActivatable, hoverPreview } from "architecture/components/core/a11y";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { QuerySuggest } from "architecture/settings/suggesters/QuerySuggest";
import { GraphCanvas } from "architecture/components/core/graph/GraphCanvas";
import { consumeGraph3DFocus } from "architecture/components/core/graph/graphFocus";
import { buildScene, indicesOf, neighbourhoodOf, type GraphScene } from "architecture/components/core/graph/graphScene";
import { layoutKey, recallLayout, rememberLayout, warmStart } from "architecture/components/core/graph/layoutCache";
import { buildExportBaseName } from "architecture/components/core/export/exportFilename";
import { ExportShareModal } from "architecture/components/core/export/ExportShareModal";
import { MapOfContentModal } from "./MapOfContentModal";
import { BlindGate } from "./BlindGate";
import { offer } from "./suggestedQuestions";
import { SHAPE_LABEL_KEY, termWords } from "./termWords";
import { asLinks } from "application/explore/mapOfContent";
import { readSelection } from "architecture/components/core/reader/readingChooser";
import type { SavedGraphQuery } from "config";
import {
    addSavedQuery,
    removeSavedQuery,
    renameSavedQuery,
    togglePinnedQuery,
    normalizeSavedQueries,
    savedQueryLabel,
} from "./savedQueries";

type LocaleKey = Parameters<typeof t>[0];

const DEBOUNCE_MS = 400;
/** A long answer draws its first rows; the rest are a count, and a narrower question away. */
const ROW_LIMIT = 200;
const TOUR_STOP_MS = 2600;

type Matches = GraphQueryResult["matches"];

/** Group labels as explicit maps, so the locale guardrail (#320) sees every key that is used. */
const FACET_LABEL_KEY: Record<FacetId, LocaleKey> = {
    region: "explore_facet_region",
    state: "explore_facet_state",
    relation: "explore_facet_relation",
    incoming: "explore_facet_incoming",
    folder: "explore_facet_folder",
    shape: "explore_facet_shape",
};

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** Is a key press meant for a text field? Then it is typing, not a command. */
function typing(evt: KeyboardEvent): boolean {
    const target = evt.target as { tagName?: string; isContentEditable?: boolean } | null;
    const tag = target?.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable === true;
}

/**
 * **Explore — ask, and the graph answers** (#696, epic #692).
 *
 * One experience where there were two. The graph fills the mode; the ask bar is its one primary
 * action; the answer arrives as a card that says how it was found and where it lives, and the graph
 * lights it — the matching notes glow, the rest of your vault dims, the camera frames them.
 *
 * What was subtracted: the List lens (the card is the list), the graph's own search (one ask box),
 * the seven lenses behind its gear (they are questions now, offered before you type, and terms you
 * can save and narrow), the lens bar and the intro line.
 *
 * What stayed, unchanged in meaning: clicking is the query (#483) — facets with counts, chips you
 * flip and remove, a zero that names the term that emptied it (#485), the query as text under the
 * card as the escape hatch (§XIII), saved queries pinned to Home, *think before you look* (#576),
 * copy, read and map (#486). Looking never writes.
 */
export class AskGraphRenderer extends KnowledgeModeRenderer {
    private query = "";
    private terms: readonly string[] = [];
    private matches: Matches = [];
    private asked = false;

    private model: ReturnType<KnowledgeIndex["getModel"]> | null = null;
    private data: Graph3DData = { nodes: [], links: [] };
    private scene: GraphScene | null = null;
    private sceneRevision = -1;
    private layoutId = "";

    private canvas: GraphCanvas | null = null;
    private rootEl: HTMLElement | null = null;
    private askInput: HTMLInputElement | null = null;
    private suggestEl: HTMLElement | null = null;
    private overviewEl: HTMLElement | null = null;
    private cardEl: HTMLElement | null = null;
    private textInput: HTMLInputElement | null = null;
    private suggest: QuerySuggest | null = null;
    private gate: BlindGate | null = null;
    private debounceTimer: number | undefined;
    private tourTimer: number | undefined;

    /** The note the answer is stepped to (←/→), as a scene index. */
    private step = -1;
    private stepList: number[] = [];
    private pendingFocus: string | null = null;

    constructor(container: HTMLElement, private readonly app: App, initialQuery?: string, _initialLens?: string) {
        super(container);
        // Deep-link from a Home pinned card (#323 G4): open pre-filled and run immediately. The lens a
        // graph door used to ask for (#484) is the whole mode now, so it needs nothing.
        if (initialQuery && initialQuery.trim() !== "") this.query = initialQuery.trim();
    }

    onload(): void {
        this.pendingFocus = consumeGraph3DFocus();
        this.renderShell();
        // Live recompute (#323): the selection, its facets and the graph refresh as the vault changes.
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.refresh(), DEBOUNCE_MS);
        };
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
        // The user's theme wins (§XV), including when they change it with Explore open.
        this.registerEvent(this.app.workspace.on("css-change", () => {
            this.canvas?.refreshTheme();
            this.renderAll();
        }));
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        this.stopTour();
        this.suggest?.close();
        this.suggest = null;
        this.container.empty();
    }

    /** `/` ask · `F` frame · `←`/`→` step · `Enter` open · `Esc` clear — on the leaf's own scope. */
    bindKeys(scope: Scope): void {
        this.key(scope, [], "/", (evt) => {
            if (typing(evt)) return;
            this.askInput?.focus();
            this.askInput?.select();
            return false;
        });
        this.key(scope, [], "f", (evt) => {
            if (typing(evt) || !this.asked) return;
            this.frameAnswer();
            return false;
        });
        this.key(scope, [], "ArrowRight", (evt) => {
            if (typing(evt) || !this.asked) return;
            this.stepBy(1);
            return false;
        });
        this.key(scope, [], "ArrowLeft", (evt) => {
            if (typing(evt) || !this.asked) return;
            this.stepBy(-1);
            return false;
        });
        this.key(scope, [], "Enter", (evt) => {
            if (typing(evt) || this.step < 0 || !this.scene) return;
            this.openNote(this.scene.ids[this.step]);
            return false;
        });
        this.key(scope, [], "Escape", (evt) => {
            if (this.step >= 0) {
                this.setStep(-1);
                return false;
            }
            if (typing(evt)) {
                (evt.target as HTMLElement | null)?.blur?.();
                return false;
            }
            if (!this.asked) return;
            this.setQuery("");
            return false;
        });
    }

    // ── the shell ───────────────────────────────────────────────────────────────

    private renderShell(): void {
        this.container.empty();
        const root = this.container.createDiv({ cls: c("explore") });
        this.rootEl = root;
        const stage = root.createDiv({ cls: c("explore-stage") });
        const canvas = new GraphCanvas(stage, {
            onClick: (index) => this.onGraphClick(index),
            onOpen: (index, event) => this.scene && this.openNote(this.scene.ids[index], event.ctrlKey || event.metaKey),
            onMenu: (index, event) => this.openNodeMenu(index, event),
            onSettled: () => this.onSettled(),
        });
        this.canvas = canvas;
        this.addChild(canvas);
        root.toggleClass(c("explore--no-graph"), canvas.kind === null);

        const head = root.createDiv({ cls: c("explore-head") });
        this.renderAskBar(head);
        this.suggestEl = head.createDiv({ cls: c("explore-suggest"), attr: { role: "group", "aria-label": t("explore_suggested") } });

        this.overviewEl = root.createDiv({ cls: c("explore-overview") });
        this.cardEl = root.createEl("aside", { cls: c("explore-card"), attr: { "aria-live": "polite", "aria-label": t("explore_answer") } });

        const hints = root.createDiv({ cls: c("explore-hints"), attr: { "aria-hidden": "true" } });
        for (const [key, word] of [["/", "explore_key_ask"], ["F", "explore_key_frame"], ["←→", "explore_key_step"], ["Esc", "explore_key_clear"]] as const) {
            const hint = hints.createSpan({ cls: c("explore-hint") });
            hint.createEl("kbd", { text: key });
            hint.createSpan({ text: t(word) });
        }

        this.renderThinkFirst();
        this.refresh();
    }

    private renderAskBar(head: HTMLElement): void {
        const bar = head.createDiv({ cls: c("explore-askrow") });
        const ask = bar.createEl("label", { cls: c("explore-ask") });
        setIcon(ask.createSpan({ cls: c("explore-ask-icon") }), "search");
        const input = ask.createEl("input", {
            cls: c("explore-ask-input"),
            attr: { type: "text", placeholder: t("explore_ask_placeholder"), "aria-label": t("explore_ask_hint"), spellcheck: "false" },
        });
        this.askInput = input;
        ask.createEl("kbd", { cls: c("explore-ask-kbd"), text: "/" });
        const go = ask.createEl("button", { cls: ["mod-cta", c("explore-ask-go")], text: t("explore_ask"), attr: { type: "button" } });
        const submit = () => this.askWords(input.value);
        this.registerDomEvent(input, "keydown", (evt) => {
            if (evt.key === "Enter") {
                evt.preventDefault();
                submit();
            }
        });
        this.registerDomEvent(go, "click", submit);

        const thinkFirst = bar.createEl("button", {
            cls: ["clickable-icon", c("explore-think-first")],
            attr: { type: "button", "aria-label": t("blind_open"), "aria-pressed": String(this.thinkFirst()) },
        });
        setIcon(thinkFirst, "brain");
        thinkFirst.toggleClass("is-active", this.thinkFirst());
        this.registerDomEvent(thinkFirst, "click", () => void this.setThinkFirst(!this.thinkFirst()));

        const more = bar.createEl("button", {
            cls: ["clickable-icon", c("explore-more")],
            attr: { type: "button", "aria-label": t("graph_more"), "aria-haspopup": "menu" },
        });
        setIcon(more, "more-horizontal");
        this.registerDomEvent(more, "click", () => this.openOptions(more));
    }

    // ── asking ──────────────────────────────────────────────────────────────────

    /** The words you typed, as the terms they stand for — shown back as chips (#696). */
    private askWords(text: string): void {
        if (text.trim() === "") {
            this.setQuery("");
            return;
        }
        const { terms, syntax } = wordsToTerms(text, this.vocabulary());
        // Syntax is used exactly as typed — including an OR, which chips cannot show.
        this.setQuery(syntax ? text.trim() : toQuery(terms));
    }

    private vocabulary(): AskVocabulary {
        const model = this.model;
        if (!model) return { states: [], folders: [], regions: [] };
        const states = new Set<string>();
        const folders = new Set<string>();
        for (const idea of model.all()) {
            states.add(idea.state);
            const slash = idea.path.indexOf("/");
            if (slash > 0) folders.add(idea.path.slice(0, slash));
        }
        const regions = (this.scene?.communities ?? []).map((community) => ({ hub: community.hub, name: community.name }));
        return { states: [...states], folders: [...folders], regions };
    }

    private setQuery(next: string): void {
        this.query = next;
        if (this.textInput) this.textInput.value = next;
        this.run();
    }

    private setTerms(terms: readonly string[]): void {
        this.setQuery(toQuery(terms));
    }

    /** Recompute the graph when the model moved, then the answer. */
    private refresh(): void {
        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") {
            this.model = null;
            this.renderIndexing();
            return;
        }
        const model = index.getModel();
        this.model = model;
        const revision = model.revision();
        if (revision !== this.sceneRevision || !this.scene) {
            this.sceneRevision = revision;
            try {
                this.data = build3DGraph(model);
                this.scene = buildScene(this.data);
                this.mountScene(this.scene);
            } catch (error) {
                log.error("[Explore] could not build the graph", error);
            }
        }
        this.run();
    }

    private mountScene(scene: GraphScene): void {
        const canvas = this.canvas;
        if (!canvas || !canvas.kind) return;
        // Where the notes were (#694): the same graph comes back exactly where it was.
        this.layoutId = layoutKey(scene);
        const known = recallLayout(this.layoutId);
        if (known) canvas.setScene(scene, known, 0);
        else {
            const start = warmStart(scene);
            canvas.setScene(scene, start.initial, start.alpha);
        }
        canvas.recordingCanvas.setAttribute("aria-label", t("graph_aria", String(scene.n)));
    }

    private run(): void {
        const model = this.model;
        if (!model) return;

        // Nothing from your vault reaches the screen before you have said what you think (#470).
        if (this.gate?.waiting) {
            this.matches = [];
            this.terms = [];
            this.asked = false;
            this.rootEl?.addClass(c("explore--veiled"));
            this.renderAll();
            return;
        }
        this.rootEl?.removeClass(c("explore--veiled"));

        const terms = asSelection(this.query);
        if (terms === null) {
            // Hand-written, with an OR in it. Chips cannot express that, so the facets stand down.
            const result = runGraphQuery(model, this.query);
            this.terms = [];
            this.matches = result.error ? [] : result.matches;
            this.asked = true;
            this.renderAll(result.error);
            return;
        }
        this.terms = terms;
        this.asked = terms.length > 0;
        this.matches = matchesFor(model, terms);
        this.renderAll();
    }

    /** Draw what the answer is: the graph's light, the card, the suggestions and the regions. */
    private renderAll(error?: string): void {
        const scene = this.scene;
        const canvas = this.canvas;
        this.setStep(-1, false);
        if (canvas && scene) {
            canvas.setLit(this.asked ? indicesOf(scene, this.matches.map((idea) => idea.path)) : null);
            canvas.setEdgeAsk(this.terms.includes("bridge") ? "bridges" : this.terms.includes("contradiction") ? "contradicts" : null);
            if (this.asked && this.matches.length > 0) this.frameAnswer();
        }
        this.stepList = scene ? this.matches.map((idea) => scene.index.get(idea.path)).filter((i): i is number => i !== undefined) : [];
        this.rootEl?.toggleClass(c("explore--asked"), this.asked);
        if (this.askInput && this.askInput.ownerDocument?.activeElement !== this.askInput) {
            this.askInput.value = this.asked ? this.terms.map((term) => termWords(term, (hub) => this.regionName(hub))).join(" · ") || this.query : "";
        }
        this.renderSuggestions();
        this.renderOverview();
        this.renderCard(error);
    }

    private renderIndexing(): void {
        this.cardEl?.empty();
        this.cardEl?.createDiv({ cls: c("explore-card-empty"), text: t("ask_graph_indexing") });
    }

    // ── what you can ask before you type ────────────────────────────────────────

    /**
     * Suggested questions (#696): each says how many notes it would light and where they live — a
     * strip in the regions' own colours — and hovering one previews the answer in the graph.
     */
    private renderSuggestions(): void {
        const el = this.suggestEl;
        const model = this.model;
        if (!el) return;
        el.empty();
        if (this.asked || !model || this.gate?.waiting) return;
        const scope = this.scope("suggest");
        const total = model.all().length;
        const pinned = normalizeSavedQueries(ObsidianApi.getOwnPlugin()?.settings.savedGraphQueries).filter((entry) => entry.pinned);
        for (const entry of pinned) {
            const terms = asSelection(entry.query);
            const matches = terms === null ? runGraphQuery(model, entry.query).matches : matchesFor(model, terms);
            this.suggestionChip(el, scope, savedQueryLabel(entry), entry.query, matches.map((idea) => idea.path), true);
        }
        for (const { question } of offer((terms) => matchesFor(model, terms).length, total)) {
            const paths = matchesFor(model, question.terms).map((idea) => idea.path);
            this.suggestionChip(el, scope, t(question.labelKey), toQuery(question.terms), paths, false);
        }
    }

    private suggestionChip(parent: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>, label: string, query: string, paths: string[], pinned: boolean): void {
        const chip = parent.createEl("button", { cls: c("explore-suggestion"), attr: { type: "button", title: query } });
        chip.toggleClass(c("explore-suggestion--pinned"), pinned);
        chip.createSpan({ cls: c("explore-suggestion-label"), text: label });
        chip.createSpan({ cls: c("explore-suggestion-count"), text: String(paths.length) });
        this.shareStrip(chip, paths, "explore-suggestion-strip");
        scope.registerDomEvent(chip, "click", () => this.setQuery(query));
        // A preview: the graph lights what the question would answer, and lets go when you leave.
        const scene = this.scene;
        if (!scene || !this.canvas?.kind) return;
        const lit = indicesOf(scene, paths);
        scope.registerDomEvent(chip, "mouseenter", () => this.canvas?.setLit(lit));
        scope.registerDomEvent(chip, "focus", () => this.canvas?.setLit(lit));
        const leave = () => {
            if (!this.asked) this.canvas?.setLit(null);
        };
        scope.registerDomEvent(chip, "mouseleave", leave);
        scope.registerDomEvent(chip, "blur", leave);
    }

    /** A strip of the regions a set of notes lives in, each segment as wide as its share. */
    private shareStrip(parent: HTMLElement, paths: readonly string[], cls: string): HTMLElement | null {
        const share = this.regionShare(paths);
        if (share.length === 0) return null;
        const strip = parent.createSpan({ cls: c(cls), attr: { "aria-hidden": "true" } });
        for (const { slot, count } of share.slice(0, 8)) {
            const segment = strip.createSpan({ cls: c("explore-share-segment") });
            segment.setCssProps({ "--zf-share": String(count), "--zf-region": this.canvas?.regionColour(slot) ?? "var(--text-faint)" });
        }
        return strip;
    }

    /** How many of `paths` live in each region, biggest first. */
    private regionShare(paths: readonly string[]): { slot: number; count: number }[] {
        const scene = this.scene;
        if (!scene) return [];
        const counts = new Map<number, number>();
        for (const path of paths) {
            const i = scene.index.get(path);
            if (i === undefined) continue;
            const slot = scene.community[i];
            if (slot < 0) continue;
            counts.set(slot, (counts.get(slot) ?? 0) + 1);
        }
        return [...counts.entries()].map(([slot, count]) => ({ slot, count })).sort((a, b) => b.count - a.count || a.slot - b.slot);
    }

    /** What a region is called: its hub note's name (#697 lets you give it another). */
    private regionName(hub: string): string {
        const community = this.scene?.communities.find((each) => each.hub === hub);
        return community?.name ?? regionBasename(hub);
    }

    // ── the vault at rest: the regions are the legend, and the legend asks ──────

    private renderOverview(): void {
        const el = this.overviewEl;
        const scene = this.scene;
        if (!el) return;
        el.empty();
        if (this.asked || !scene || this.gate?.waiting) return;
        const scope = this.scope("overview");
        el.createDiv({ cls: c("explore-overview-cap"), text: `${t("explore_regions_heading")} · ${tCount(scene.n, "graph_status_notes", String(scene.n))}` });
        const list = el.createDiv({ cls: c("explore-overview-list") });
        for (const community of scene.communities.slice(0, 12)) {
            const row = list.createEl("button", { cls: c("explore-region"), attr: { type: "button" } });
            const dot = row.createSpan({ cls: c("explore-region-dot") });
            dot.setCssProps({ "--zf-region": this.canvas?.regionColour(community.index) ?? "var(--text-faint)" });
            row.createSpan({ cls: c("explore-region-name"), text: community.name });
            row.createSpan({ cls: c("explore-region-count"), text: String(community.size) });
            const members = new Set<number>();
            for (let i = 0; i < scene.n; i++) if (scene.community[i] === community.index) members.add(i);
            scope.registerDomEvent(row, "mouseenter", () => this.canvas?.setLit(members));
            scope.registerDomEvent(row, "mouseleave", () => !this.asked && this.canvas?.setLit(null));
            scope.registerDomEvent(row, "click", () => this.setTerms([`region:${community.hub}`]));
        }
        if (scene.communities.length > 12) {
            list.createDiv({ cls: c("explore-overview-more"), text: t("explore_facet_more", String(scene.communities.length - 12)) });
        }
        this.renderSaved(el, scope);
    }

    // ── the answer ──────────────────────────────────────────────────────────────

    /**
     * The card: how many, the terms as chips, how the answer was found, where it lives, the notes —
     * each row carrying the facts the question asked about (#485) — what can narrow it further, and
     * where it can go. With no graph to light (no canvas on this device), the card is the whole
     * answer, so it opens on every note instead of waiting for a question.
     */
    private renderCard(error?: string): void {
        const card = this.cardEl;
        const model = this.model;
        if (!card || !model) return;
        card.empty();
        const showing = this.asked || this.canvas?.kind === null;
        card.toggleClass(c("explore-card--open"), showing && !this.gate?.waiting);
        if (!showing || this.gate?.waiting) return;
        const scope = this.scope("card");
        const total = model.all().length;

        const top = card.createDiv({ cls: c("explore-card-top") });
        const count = top.createDiv({ cls: c("explore-card-count") });
        count.createSpan({ cls: c("explore-card-number"), text: String(this.matches.length) });
        count.createSpan({ cls: c("explore-card-unit"), text: tCount(this.matches.length, "explore_answer_word") });
        this.renderChips(top, scope);

        if (error) {
            card.createDiv({ cls: c("explore-card-empty"), text: error });
            this.renderEscape(card, scope);
            return;
        }
        if (this.matches.length === 0) {
            // A zero names the term that emptied it (#485) — a fact, never advice.
            const emptied = explainEmpty(model, this.terms);
            card.createDiv({
                cls: c("explore-card-empty"),
                text: emptied ? t("explore_emptied_by", termWords(emptied.term, (hub) => this.regionName(hub)), String(emptied.before)) : t("ask_graph_no_results"),
            });
            this.renderEscape(card, scope);
            return;
        }

        const body = card.createDiv({ cls: c("explore-card-body") });
        if (this.canvas?.kind === null && !this.asked) {
            body.createDiv({ cls: c("explore-card-note"), text: t("graph_unavailable") });
        }
        const funnel = answerFunnel(model, this.terms);
        if (funnel && funnel.length > 1) this.renderFunnel(body, funnel, total);
        this.renderWhere(body, scope);
        this.renderFacets(body, scope);
        this.renderRows(body, scope, model);
        this.renderTake(card, scope);
        this.renderEscape(card, scope);
    }

    private renderChips(parent: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>): void {
        const chips = parent.createDiv({ cls: c("explore-chips") });
        if (asSelection(this.query) === null) {
            chips.createSpan({ cls: c("explore-hand-written"), text: t("explore_hand_written") });
        }
        for (const [index, term] of this.terms.entries()) {
            const chip = chips.createDiv({ cls: c("explore-chip"), attr: { title: term } });
            chip.toggleClass(c("explore-chip--negated"), term.startsWith("!"));
            chip.createSpan({ cls: c("explore-chip-term"), text: termWords(term, (hub) => this.regionName(hub)) });
            this.button(chip, scope, "explore_chip_negate", "explore-chip-negate", "¬", () =>
                this.setTerms(this.terms.map((each, at) => (at === index ? invertTerm(each) : each)))
            );
            this.button(chip, scope, "explore_chip_remove", "explore-chip-remove", "×", () =>
                this.setTerms(this.terms.filter((_, at) => at !== index))
            );
        }
        if (this.query.trim() === "") return;
        this.button(chips, scope, "explore_clear", "explore-clear", null, () => this.setQuery(""));
        this.button(chips, scope, "explore_save_selection", "explore-save", null, () => void this.save());
    }

    /** How the answer was found (#696): your vault, then each term and what it left — as bars. */
    private renderFunnel(parent: HTMLElement, steps: FunnelStep[], total: number): void {
        const section = parent.createDiv({ cls: c("explore-section") });
        section.createEl("h4", { cls: c("explore-section-title"), text: t("explore_how_found") });
        for (const step of steps) {
            const row = section.createDiv({ cls: c("explore-funnel-row") });
            const bar = row.createDiv({ cls: c("explore-funnel-bar") });
            bar.createDiv({ cls: c("explore-funnel-fill") }).setCssProps({ "--zf-fill": String(total === 0 ? 0 : step.count / total) });
            bar.createSpan({ cls: c("explore-funnel-label"), text: step.term === null ? t("explore_your_vault") : termWords(step.term, (hub) => this.regionName(hub)) });
            row.createSpan({ cls: c("explore-funnel-count"), text: String(step.count) });
        }
    }

    /** Where it lives: a bar in the regions' colours, and the biggest four — each frames its notes. */
    private renderWhere(parent: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>): void {
        const scene = this.scene;
        if (!scene) return;
        const paths = this.matches.map((idea) => idea.path);
        const share = this.regionShare(paths);
        if (share.length === 0) return;
        const section = parent.createDiv({ cls: c("explore-section") });
        section.createEl("h4", { cls: c("explore-section-title"), text: t("explore_where_lives") });
        this.shareStrip(section, paths, "explore-where-strip");
        const keys = section.createDiv({ cls: c("explore-where-keys") });
        for (const { slot, count } of share.slice(0, 4)) {
            const community = scene.communities[slot];
            const key = keys.createEl("button", { cls: c("explore-where-key"), attr: { type: "button" } });
            key.createSpan({ cls: c("explore-region-dot") }).setCssProps({ "--zf-region": this.canvas?.regionColour(slot) ?? "var(--text-faint)" });
            key.createSpan({ text: `${community?.name ?? ""} ${count}` });
            scope.registerDomEvent(key, "click", () => {
                const members = this.stepList.filter((i) => scene.community[i] === slot);
                this.canvas?.frame(members, { shift: this.cardShift() });
            });
        }
    }

    /** What the answer can still be narrowed by — derived from the vault, with counts (#482). */
    private renderFacets(parent: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>): void {
        const model = this.model;
        if (!model || asSelection(this.query) === null) return;
        const facets = deriveFacets(model, this.matches);
        if (facets.length === 0) return;
        // Folded until wanted: the answer's own notes come first, and narrowing is one click away.
        const section = parent.createEl("details", { cls: c("explore-section", "explore-facets") });
        section.createEl("summary", { cls: c("explore-section-title"), text: t("explore_narrow") });
        for (const facet of facets) {
            const group = section.createDiv({ cls: c("explore-facet") });
            group.createSpan({ cls: c("explore-facet-label"), text: t(FACET_LABEL_KEY[facet.id]) });
            const values = group.createDiv({ cls: c("explore-facet-values") });
            for (const value of facet.values) {
                const btn = values.createEl("button", { cls: c("explore-facet-value"), attr: { type: "button" } });
                if (facet.id === "region") {
                    const slot = this.scene?.communities.findIndex((each) => each.hub === value.value) ?? -1;
                    btn.createSpan({ cls: c("explore-region-dot") }).setCssProps({ "--zf-region": slot >= 0 && this.canvas ? this.canvas.regionColour(slot) : "var(--text-faint)" });
                }
                btn.createSpan({ cls: c("explore-facet-name"), text: this.facetLabel(facet, value) });
                btn.createSpan({ cls: c("explore-facet-count"), text: String(value.count) });
                btn.setCssProps({ "--zf-fill": String(value.count / Math.max(1, this.matches.length)) });
                scope.registerDomEvent(btn, "click", () => this.setTerms(toggleTerm(this.terms, value.term)));
                // A preview: the graph lights what this value would leave.
                const scene = this.scene;
                if (scene && this.canvas?.kind) {
                    scope.registerDomEvent(btn, "mouseenter", () => {
                        const next = matchesFor(model, toggleTerm(this.terms, value.term));
                        this.canvas?.setLit(indicesOf(scene, next.map((idea) => idea.path)));
                    });
                    scope.registerDomEvent(btn, "mouseleave", () => this.canvas?.setLit(indicesOf(scene, this.matches.map((idea) => idea.path))));
                }
            }
            if (facet.hidden > 0) values.createSpan({ cls: c("explore-facet-more"), text: t("explore_facet_more", String(facet.hidden)) });
        }
    }

    /** A state, a relation type and a folder are your own words; a shape is ours; a region is its name. */
    private facetLabel(facet: Facet, value: FacetValue): string {
        if (facet.id === "region") return this.regionName(value.value);
        const key = facet.id === "shape" ? SHAPE_LABEL_KEY[value.value] : undefined;
        return key ? t(key) : value.value;
    }

    /** The notes: each row opens on a click, previews on a hover, and steps the graph to it. */
    private renderRows(parent: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>, model: NonNullable<AskGraphRenderer["model"]>): void {
        const section = parent.createDiv({ cls: c("explore-section", "explore-rows") });
        section.createEl("h4", { cls: c("explore-section-title"), text: t("explore_the_notes") });
        const scene = this.scene;
        for (const [at, match] of this.matches.slice(0, ROW_LIMIT).entries()) {
            const row = section.createDiv({ cls: c("explore-row"), attr: { "data-path": match.path } });
            const i = scene?.index.get(match.path);
            if (scene && i !== undefined) {
                row.createSpan({ cls: c("explore-region-dot") }).setCssProps({ "--zf-region": this.canvas?.regionColour(scene.community[i]) ?? "var(--text-faint)" });
            }
            const name = row.createSpan({ cls: c("explore-row-name"), text: basename(match.path), attr: { title: match.path } });
            makeActivatable(name, () => this.openNote(match.path));
            hoverPreview(this.app, name, match.path, this);
            row.createSpan({ cls: c("explore-row-facts"), text: rowFacts(match, this.terms, model).map((fact) => this.factText(fact)).join(" · ") });
            scope.registerDomEvent(row, "mouseenter", () => i !== undefined && this.canvas?.setMarked(this.step >= 0 ? [this.step, i] : [i]));
            scope.registerDomEvent(row, "mouseleave", () => this.canvas?.setMarked(this.step >= 0 ? [this.step] : []));
            scope.registerDomEvent(row, "click", (evt) => {
                if (evt.target === name) return;
                this.setStep(this.stepList.indexOf(i ?? -1) >= 0 ? (i as number) : -1);
                void at;
            });
        }
        if (this.matches.length > ROW_LIMIT) {
            section.createDiv({ cls: c("explore-facet-more"), text: t("explore_facet_more", String(this.matches.length - ROW_LIMIT)) });
        }
    }

    /** A fact reads `label value`; the label names its relation type when the key cannot. */
    private factText(fact: RowFact): string {
        const label = fact.arg ? t(fact.key as LocaleKey, fact.arg) : t(fact.key as LocaleKey);
        return `${label} ${fact.value}`;
    }

    /**
     * Where an answer can go (#486, #669): copy as links, read them, make a map of content — all
     * mechanical, and only the map writes, after its own preview.
     */
    private renderTake(card: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>): void {
        const foot = card.createDiv({ cls: c("explore-card-foot") });
        this.button(foot, scope, "explore_copy_links", "explore-take-copy", null, () => {
            void navigator.clipboard.writeText(asLinks(this.matches));
            new Notice(t("explore_copied", String(this.matches.length)));
        });
        // A reading of everything is not a reading, and a map of everything is not a map.
        if (this.terms.length === 0) return;
        this.button(foot, scope, "reader_read_these", "explore-take-read", null, () =>
            readSelection(this.app, this.matches.map((idea) => idea.path))
        );
        this.button(foot, scope, "explore_make_map", "explore-take-map", null, () => this.makeMap()).addClass("mod-cta");
    }

    private makeMap(): void {
        new MapOfContentModal(this.app, { matches: this.matches }, toQuery(this.terms), (path) => this.openNote(path)).open();
    }

    /**
     * The escape hatch, and only that: the query as text, folded away (§XIII). Typing here never
     * re-renders — it runs on Enter or on the button (#468).
     */
    private renderEscape(card: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>): void {
        const details = card.createEl("details", { cls: c("explore-text") });
        details.createEl("summary", { text: t("explore_as_text") });
        const bar = details.createDiv({ cls: c("explore-text-bar") });
        const input = bar.createEl("input", { cls: c("explore-text-input"), attr: { type: "text", "aria-label": t("explore_as_text") } });
        input.placeholder = t("ask_graph_placeholder");
        input.value = this.query;
        this.textInput = input;
        this.suggest?.close();
        this.suggest = new QuerySuggest(input, () => this.facetVocabulary());
        let draft = this.query;
        scope.registerDomEvent(input, "input", () => (draft = input.value));
        scope.registerDomEvent(input, "keydown", (evt) => {
            if (evt.key === "Enter") this.setQuery(draft);
        });
        const run = bar.createEl("button", { cls: c("explore-text-run"), text: t("ask_graph_run"), attr: { type: "button" } });
        scope.registerDomEvent(run, "click", () => this.setQuery(draft));
    }

    /** What completion offers: the grammar, and your vault's own values. */
    private facetVocabulary(): string[] {
        const model = this.model;
        if (!model) return [];
        return [...new Set(deriveFacets(model, model.all()).flatMap((facet) => facet.values.map((value) => value.term)))];
    }

    /** Every button on this surface: labelled for a screen reader, whatever it shows. */
    private button(
        parent: HTMLElement,
        scope: ReturnType<KnowledgeModeRenderer["scope"]>,
        labelKey: LocaleKey,
        cls: string,
        glyph: string | null,
        onClick: () => void
    ): HTMLElement {
        const btn = parent.createEl("button", { cls: c(cls), text: glyph ?? t(labelKey), attr: { type: "button" } });
        btn.setAttribute("aria-label", t(labelKey));
        scope.registerDomEvent(btn, "click", onClick);
        return btn;
    }

    // ── the graph's side ────────────────────────────────────────────────────────

    /** How much wider to frame when the card covers part of the view. */
    private cardShift(): number {
        return this.cardEl?.hasClass(c("explore-card--open")) ? 1.2 : 1;
    }

    private frameAnswer(): void {
        if (this.stepList.length > 0) this.canvas?.frame(this.stepList, { shift: this.cardShift() });
    }

    private onSettled(): void {
        const scene = this.scene;
        const canvas = this.canvas;
        if (!scene || !canvas) return;
        rememberLayout(this.layoutId, scene, canvas.layoutPositions);
        if (this.pendingFocus) {
            const at = scene.index.get(this.pendingFocus);
            this.pendingFocus = null;
            if (at !== undefined) {
                canvas.setFocus(at);
                canvas.setMarked([at]);
                canvas.frame(neighbourhoodOf(scene, at), { min: 420 });
                return;
            }
        }
        if (this.asked) this.frameAnswer();
    }

    /** Step through the answer (←/→): the graph focuses the note and its neighbours. */
    private stepBy(delta: number): void {
        if (this.stepList.length === 0) return;
        const at = this.stepList.indexOf(this.step);
        const next = at < 0 ? (delta > 0 ? 0 : this.stepList.length - 1) : (at + delta + this.stepList.length) % this.stepList.length;
        this.setStep(this.stepList[next]);
    }

    private setStep(index: number, frame = true): void {
        this.step = index;
        const canvas = this.canvas;
        const scene = this.scene;
        for (const row of this.cardEl?.querySelectorAll(`.${c("explore-row")}`) ?? []) {
            row.toggleClass("is-active", scene !== null && index >= 0 && row.getAttribute("data-path") === scene.ids[index]);
        }
        if (!canvas || !scene) return;
        if (index < 0) {
            canvas.setFocus(null);
            canvas.setMarked([]);
            return;
        }
        canvas.setFocus(index);
        canvas.setMarked([index]);
        if (frame) canvas.frame([...neighbourhoodOf(scene, index)].filter((i) => scene.community[i] === scene.community[index]), { min: 420, shift: this.cardShift() });
        const row = this.cardEl?.querySelector(`.${c("explore-row")}.is-active`);
        row?.scrollIntoView({ block: "nearest" });
    }

    private onGraphClick(index: number | null): void {
        if (index === null || index === this.step) {
            this.setStep(-1);
            return;
        }
        this.setStep(index);
    }

    private openNote(path: string, newTab = false): void {
        void this.app.workspace.openLinkText(path, "", newTab ? "tab" : false);
    }

    private openNodeMenu(index: number, event: MouseEvent): void {
        const scene = this.scene;
        if (!scene) return;
        const path = scene.ids[index];
        const menu = new Menu();
        menu.addItem((item) => item.setTitle(t("graph_menu_open")).setIcon("file").onClick(() => this.openNote(path)));
        menu.addItem((item) => item.setTitle(t("graph_menu_open_tab")).setIcon("file-plus").onClick(() => this.openNote(path, true)));
        menu.addItem((item) => item.setTitle(t("graph_menu_focus")).setIcon("focus").onClick(() => this.setStep(index)));
        menu.showAtMouseEvent(event);
    }

    /** Colour, view, labels, frame, tour and export — the overflow; asking is the one primary action. */
    private openOptions(anchor: HTMLElement): void {
        const canvas = this.canvas;
        const menu = new Menu();
        if (canvas?.kind) {
            menu.addItem((item) => item.setTitle(t("graph_color_region")).setChecked(canvas.colorBy === "region").onClick(() => this.setView({ colorBy: "region" })));
            menu.addItem((item) => item.setTitle(t("graph_color_state")).setChecked(canvas.colorBy === "state").onClick(() => this.setView({ colorBy: "state" })));
            menu.addSeparator();
            menu.addItem((item) => item.setTitle(t("graph_view_3d")).setChecked(!canvas.flat).onClick(() => this.setView({ flat: false })));
            menu.addItem((item) => item.setTitle(t("graph_view_flat")).setChecked(canvas.flat).onClick(() => this.setView({ flat: true })));
            menu.addSeparator();
            menu.addItem((item) => item.setTitle(t("graph_labels_more")).setChecked(canvas.labelDensity === "more").onClick(() => this.setView({ labels: "more" })));
            menu.addItem((item) => item.setTitle(t("graph_labels_few")).setChecked(canvas.labelDensity === "few").onClick(() => this.setView({ labels: "few" })));
            menu.addSeparator();
            menu.addItem((item) => item.setTitle(t("graph_fit")).setIcon("maximize").onClick(() => canvas.frameAll()));
            menu.addItem((item) =>
                item
                    .setTitle(this.tourTimer === undefined ? t("graph_tour_start") : t("graph_tour_stop"))
                    .setIcon("route")
                    .onClick(() => (this.tourTimer === undefined ? this.startTour() : this.stopTour()))
            );
            menu.addItem((item) => item.setTitle(t("graph_export_image")).setIcon("image").onClick(() => void this.exportImage()));
        }
        // Where the control is, not where the pointer last was — it opens from the keyboard too (#577).
        const rect = anchor.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right, y: rect.bottom });
    }

    /** A view choice, remembered: it is how you like to look, not a one-off (§XIII). */
    private setView(change: { colorBy?: "region" | "state"; flat?: boolean; labels?: "few" | "more" }): void {
        const canvas = this.canvas;
        if (!canvas) return;
        if (change.colorBy) canvas.setColorBy(change.colorBy);
        if (change.flat !== undefined) canvas.setFlat(change.flat);
        if (change.labels) canvas.setLabels(change.labels);
        this.renderAll();
    }

    /** A flight through the hubs and the newest notes, from the pure {@link tourStops} (#385). */
    private startTour(): void {
        const scene = this.scene;
        const canvas = this.canvas;
        if (!scene || !canvas) return;
        const stops = tourStops(this.data)
            .map((stop) => scene.index.get(stop.id))
            .filter((i): i is number => i !== undefined);
        if (stops.length === 0) return;
        canvas.stopSpin();
        let at = 0;
        const go = () => {
            if (at >= stops.length) {
                this.stopTour();
                canvas.frameAll();
                return;
            }
            const stop = stops[at++];
            canvas.setMarked([stop]);
            canvas.frame(neighbourhoodOf(scene, stop), { min: 380 });
            this.tourTimer = window.setTimeout(go, TOUR_STOP_MS);
        };
        go();
    }

    private stopTour(): void {
        if (this.tourTimer === undefined) return;
        window.clearTimeout(this.tourTimer);
        this.tourTimer = undefined;
        this.canvas?.setMarked(this.step >= 0 ? [this.step] : []);
    }

    /** Frame everything, then capture the view — graph and labels — and offer it to save (#386). */
    private async exportImage(): Promise<void> {
        const canvas = this.canvas;
        if (!canvas) return;
        canvas.frameAll(true);
        const blob = await canvas.capture();
        if (!blob) return;
        new ExportShareModal(this.app, { blob, baseName: buildExportBaseName("universe", new Date()), kind: "image" }).open();
    }

    // ── think before you look (#576) ────────────────────────────────────────────

    private thinkFirst(): boolean {
        return ObsidianApi.getOwnPlugin()?.settings.exploreThinkFirst === true;
    }

    /**
     * *Think before you look* — opt-in and remembered (§XII): while it waits for your answer the
     * graph is veiled and nothing from your vault is on screen.
     */
    private renderThinkFirst(): void {
        if (this.gate) this.removeChild(this.gate);
        this.gate = null;
        if (!this.thinkFirst() || !this.rootEl) return;
        const host = this.rootEl.createDiv({ cls: c("explore-gate") });
        this.gate = new BlindGate(
            host,
            (query) => this.setQuery(query),
            () => this.setQuery("")
        );
        this.addChild(this.gate);
    }

    private async setThinkFirst(next: boolean): Promise<void> {
        const plugin = ObsidianApi.getOwnPlugin();
        if (!plugin) return;
        plugin.settings.exploreThinkFirst = next;
        await plugin.saveSettings();
        this.query = "";
        this.removeChild(this.canvas as GraphCanvas);
        this.canvas = null;
        this.scene = null;
        this.renderShell();
    }

    // ── saved queries (#323 G4) ─────────────────────────────────────────────────

    private savedQueries(): SavedGraphQuery[] {
        return normalizeSavedQueries(ObsidianApi.getOwnPlugin()?.settings.savedGraphQueries);
    }

    /** Apply a pure list transform, persist it, and redraw — the one write path for saved queries. */
    private async mutateSaved(transform: (list: SavedGraphQuery[]) => SavedGraphQuery[]): Promise<void> {
        const plugin = ObsidianApi.getOwnPlugin();
        if (!plugin) return;
        plugin.settings.savedGraphQueries = transform(this.savedQueries());
        await plugin.saveSettings();
        this.renderAll();
    }

    private save(): void {
        void this.mutateSaved((list) => addSavedQuery(list, this.query));
    }

    private renderSaved(parent: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>): void {
        const saved = this.savedQueries();
        if (saved.length === 0) return;
        const box = parent.createDiv({ cls: c("explore-saved") });
        box.createDiv({ cls: c("explore-overview-cap"), text: t("ask_graph_saved_heading") });
        const list = box.createEl("ul", { cls: c("explore-saved-list") });
        for (const entry of saved) this.renderSavedRow(list, entry, scope);
    }

    /** One saved query: run it, rename, pin to Home, delete. */
    private renderSavedRow(list: HTMLElement, entry: SavedGraphQuery, scope: ReturnType<KnowledgeModeRenderer["scope"]>): void {
        const li = list.createEl("li", { cls: c("explore-saved-item") });
        const label = li.createSpan({ cls: c("explore-saved-query"), text: savedQueryLabel(entry), attr: { title: entry.query } });
        makeActivatable(label, () => this.setQuery(entry.query));
        const actions = li.createDiv({ cls: c("explore-saved-actions") });
        this.button(actions, scope, "ask_graph_rename", "explore-saved-rename", null, () => this.renameSaved(entry, label, scope));
        this.button(actions, scope, entry.pinned ? "ask_graph_unpin" : "ask_graph_pin", "explore-saved-pin", null, () =>
            void this.mutateSaved((l) => togglePinnedQuery(l, entry.query))
        ).toggleClass("is-active", entry.pinned === true);
        this.button(actions, scope, "ask_graph_delete", "explore-saved-delete", null, () => void this.mutateSaved((l) => removeSavedQuery(l, entry.query)));
    }

    /** Inline rename: swap the label for a text field, commit on Enter/blur, cancel on Escape. */
    private renameSaved(entry: SavedGraphQuery, label: HTMLElement, scope: ReturnType<KnowledgeModeRenderer["scope"]>): void {
        const input = createEl("input", { type: "text", cls: c("explore-saved-rename-input") });
        input.value = savedQueryLabel(entry);
        input.setAttribute("aria-label", t("ask_graph_rename"));
        label.replaceWith(input);
        input.focus();
        input.select();
        let done = false;
        const commit = (save: boolean) => {
            if (done) return;
            done = true;
            if (save) void this.mutateSaved((l) => renameSavedQuery(l, entry.query, input.value));
            else this.renderAll();
        };
        scope.registerDomEvent(input, "keydown", (evt) => {
            if (evt.key === "Enter") commit(true);
            else if (evt.key === "Escape") commit(false);
        });
        scope.registerDomEvent(input, "blur", () => commit(true));
    }
}

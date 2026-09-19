import { App } from "obsidian";
import { c, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    asSelection,
    deriveFacets,
    invertTerm,
    matchesFor,
    runGraphQuery,
    toQuery,
    toggleTerm,
    type Facet,
    type FacetId,
    type FacetValue,
    type GraphQueryResult,
} from "architecture/knowledge/state";
import { makeActivatable } from "architecture/components/core/a11y";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { QuerySuggest } from "architecture/settings/suggesters/QuerySuggest";
import { Graph3DRenderer } from "architecture/components/core/graph3d/Graph3DRenderer";
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

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

const DEBOUNCE_MS = 400;

/** The matches, typed through the State surface rather than by reaching into the model (#266). */
type Matches = GraphQueryResult["matches"];

/**
 * The lenses: **two**, and each is a genuinely different way of seeing the same selection.
 *
 * *List* reads it. *Graph* (#484) shows it in context — your whole vault drawn, with the selection
 * lit and the rest dimmed — which is the thing a list structurally cannot do. The table lens that
 * sat here until #483 was the list with four fixed columns; its one real advantage was alignment,
 * and alignment is a CSS grid rule.
 *
 * Switching lens never recomputes the selection. `run()` computes; `setLens` only redraws.
 */
const LENSES = ["list", "graph"] as const;
type ResultLens = (typeof LENSES)[number];

/**
 * Group and shape labels as explicit maps rather than composed keys, so the locale guardrail
 * (#320) can still see every key that is used.
 */
const FACET_LABEL_KEY: Record<FacetId, LocaleKey> = {
    state: "explore_facet_state",
    relation: "explore_facet_relation",
    incoming: "explore_facet_incoming",
    folder: "explore_facet_folder",
    shape: "explore_facet_shape",
};

const SHAPE_LABEL_KEY: Record<string, LocaleKey> = {
    hub: "explore_shape_hub",
    orphan: "explore_shape_orphan",
    leaf: "explore_shape_leaf",
    unsourced: "explore_shape_unsourced",
};

/**
 * **Explore** — clicking is the query (#483, epic #481).
 *
 * This mode used to open on an empty box and a *guided builder*: two `<select>`s, a value field, a
 * negate checkbox and an **Add** button whose entire effect was to paste DSL text into the box. A
 * form that emits code, which is exactly what [§XIII](../../../../../docs/development/constitution.md)
 * names as *not shippable* — configuration syntax is an export format and an escape hatch, never
 * the front door.
 *
 * So the order is inverted. **The selection is what you hold** and the text is what it produces:
 *
 * - opening it costs **zero typing** — with nothing picked, the selection is your whole vault;
 * - what you can narrow by is **derived from your notes** (#482), with counts, and clicking a
 *   value can never empty the results because a value that would is never offered;
 * - each pick becomes a **chip** you can negate or remove — negation stays reachable without
 *   typing, which the deleted checkbox was the only way to do;
 * - the DSL sits under *as text*: generated, editable, runnable, and still exactly what a saved
 *   query stores.
 *
 * The one thing the text can express that chips cannot is `OR`. A hand-written disjunction is
 * shown as text and **says so**, and the facets stand down rather than appending a term that would
 * silently re-bracket the query.
 */
export class AskGraphRenderer extends KnowledgeModeRenderer {
    private query = "";
    private input: HTMLInputElement | null = null;
    private facetsEl: HTMLElement | null = null;
    private chipsEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private savedEl: HTMLElement | null = null;
    private debounceTimer: number | undefined;
    private suggest: QuerySuggest | null = null;
    private lens: ResultLens = "list";
    private readonly lensButtons = new Map<ResultLens, HTMLElement>();
    private graphLens: Graph3DRenderer | null = null;
    /** The last computed selection, so switching lens never re-asks the question. */
    private matches: Matches = [];

    constructor(container: HTMLElement, private readonly app: App, initialQuery?: string, initialLens?: string) {
        super(container);
        // Deep-link from a Home pinned card (#323 G4): open pre-filled and run immediately.
        if (initialQuery && initialQuery.trim() !== "") this.query = initialQuery.trim();
        // …or from any of the graph doors (#484), which ask for Explore with the graph already up.
        if (initialLens === "graph") this.lens = "graph";
    }

    onload(): void {
        this.renderShell();
        // Live recompute (#323): the selection and its facets refresh as the vault changes.
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.run(), DEBOUNCE_MS);
        };
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        this.suggest?.close();
        this.suggest = null;
        this.container.empty();
    }

    private renderShell(): void {
        const root = this.container.createDiv({ cls: c("ask-graph") });
        root.createDiv({ cls: c("ask-graph-intro"), text: t("explore_intro") });

        this.facetsEl = root.createDiv({ cls: c("ask-graph-facets") });
        this.chipsEl = root.createDiv({ cls: c("ask-graph-chips") });

        const lensBar = root.createDiv({ cls: c("ask-graph-lenses") });
        this.lensButtons.clear();
        for (const lens of LENSES) {
            const btn = lensBar.createEl("button", {
                text: t(`ask_graph_lens_${lens}` as LocaleKey),
                cls: c("ask-graph-lens"),
            });
            btn.toggleClass(c("ask-graph-lens--active"), this.lens === lens);
            this.registerDomEvent(btn, "click", () => this.setLens(lens));
            this.lensButtons.set(lens, btn);
        }

        this.statusEl = root.createDiv({ cls: c("ask-graph-status") });
        this.resultsEl = root.createDiv({ cls: c("ask-graph-results") });
        this.renderTextEscape(root);
        this.savedEl = root.createDiv({ cls: c("ask-graph-saved") });
        this.renderSaved();
        this.run();
    }

    /**
     * The escape hatch, and only that: the query as text, folded away. Typing here **never**
     * re-renders — the surface runs on Enter or on the button, because a view that rebuilds itself
     * on every keystroke is a view you cannot type in (the lesson #468 paid for).
     */
    private renderTextEscape(root: HTMLElement): void {
        const details = root.createEl("details", { cls: c("ask-graph-text") });
        details.createEl("summary", { text: t("explore_as_text") });
        const bar = details.createDiv({ cls: c("ask-graph-bar") });
        this.input = bar.createEl("input", { type: "text", cls: c("ask-graph-input") });
        this.input.placeholder = t("ask_graph_placeholder");
        this.input.setAttribute("aria-label", t("explore_as_text"));
        this.input.value = this.query;
        // Not a Component: closed by hand on unload rather than registered as a child.
        this.suggest = new QuerySuggest(this.input, () => this.vocabulary());
        this.registerDomEvent(this.input, "input", () => (this.query = this.input?.value ?? ""));
        this.registerDomEvent(this.input, "keydown", (evt) => {
            if (evt.key === "Enter") this.run();
        });
        const runBtn = bar.createEl("button", { text: t("ask_graph_run"), cls: c("ask-graph-run") });
        this.registerDomEvent(runBtn, "click", () => this.run());
    }

    /**
     * What completion offers: the grammar, and your vault's own values. Two sources and no third —
     * a hardcoded list of fields beside them is how the deleted builder went wrong.
     */
    private vocabulary(): string[] {
        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") return [];
        const model = index.getModel();
        const values = deriveFacets(model, model.all()).flatMap((facet) => facet.values.map((v) => v.term));
        return [...new Set(values)];
    }

    private setQuery(next: string): void {
        this.query = next;
        if (this.input) this.input.value = next;
        this.run();
    }

    private setTerms(terms: readonly string[]): void {
        this.setQuery(toQuery(terms));
    }

    /** A lens change is a redraw, never a re-ask: the selection it draws was already computed. */
    private setLens(lens: ResultLens): void {
        if (this.lens === lens) return;
        this.lens = lens;
        for (const [id, btn] of this.lensButtons) btn.toggleClass(c("ask-graph-lens--active"), id === lens);
        this.renderResults();
    }

    private openNote(path: string): void {
        void this.app.workspace.openLinkText(path, "", false);
    }

    private run(): void {
        if (!this.resultsEl || !this.statusEl || !this.facetsEl || !this.chipsEl) return;
        this.facetsEl.empty();
        this.chipsEl.empty();
        this.statusEl.textContent = "";

        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") {
            this.statusEl.textContent = t("ask_graph_indexing");
            return;
        }
        const model = index.getModel();
        const terms = asSelection(this.query);

        if (terms === null) {
            // Hand-written, with an OR in it. Chips cannot express that, and appending a term
            // would re-bracket the query behind your back — so the facets stand down.
            const result = runGraphQuery(model, this.query);
            this.renderChips(null);
            if (result.error) {
                // Clear the stale answer first, then say what is wrong with the new query.
                this.renderAnswer([], model.all().length);
                this.statusEl.textContent = result.error;
                return;
            }
            this.renderAnswer(result.matches, model.all().length);
            return;
        }

        const matches = matchesFor(model, terms);
        this.renderFacets(deriveFacets(model, matches), terms);
        this.renderChips(terms);
        this.renderAnswer(matches, model.all().length);
    }

    /** What the selection can still be narrowed by — derived from the vault, with counts (#482). */
    private renderFacets(facets: Facet[], terms: readonly string[]): void {
        if (!this.facetsEl) return;
        for (const facet of facets) {
            const group = this.facetsEl.createDiv({ cls: c("ask-graph-facet") });
            group.createSpan({ cls: c("ask-graph-facet-label"), text: t(FACET_LABEL_KEY[facet.id]) });
            const values = group.createDiv({ cls: c("ask-graph-facet-values") });
            for (const value of facet.values) {
                const btn = values.createEl("button", { cls: c("ask-graph-facet-value") });
                btn.createSpan({ cls: c("ask-graph-facet-name"), text: this.facetLabel(facet, value) });
                btn.createSpan({ cls: c("ask-graph-facet-count"), text: String(value.count) });
                this.registerDomEvent(btn, "click", () => this.setTerms(toggleTerm(terms, value.term)));
            }
            if (facet.hidden > 0) {
                values.createSpan({
                    cls: c("ask-graph-facet-more"),
                    text: t("explore_facet_more", String(facet.hidden)),
                });
            }
        }
    }

    /** A state, a relation type and a folder are your own words; a shape is ours, so it is translated. */
    private facetLabel(facet: Facet, value: FacetValue): string {
        const key = facet.id === "shape" ? SHAPE_LABEL_KEY[value.value] : undefined;
        return key ? t(key) : value.value;
    }

    /**
     * The selection itself: one chip per term, each negatable and removable — and, when the query
     * was written by hand with an `OR` in it, a line saying so instead of chips that would lose
     * half of what it means.
     */
    private renderChips(terms: readonly string[] | null): void {
        if (!this.chipsEl) return;
        if (terms === null) {
            this.chipsEl.createSpan({ cls: c("ask-graph-hand-written"), text: t("explore_hand_written") });
        }
        const picked = terms ?? [];
        for (const [index, term] of picked.entries()) {
            const chip = this.chipsEl.createDiv({ cls: c("ask-graph-chip") });
            chip.toggleClass(c("ask-graph-chip--negated"), term.startsWith("!"));
            chip.createSpan({ cls: c("ask-graph-chip-term"), text: term });
            this.button(chip, "explore_chip_negate", "ask-graph-chip-negate", "¬", () =>
                this.setTerms(picked.map((each, at) => (at === index ? invertTerm(each) : each)))
            );
            this.button(chip, "explore_chip_remove", "ask-graph-chip-remove", "×", () =>
                this.setTerms(picked.filter((_, at) => at !== index))
            );
        }
        if (this.query.trim() === "") return;
        this.button(this.chipsEl, "explore_clear", "ask-graph-clear", null, () => this.setQuery(""));
        this.button(this.chipsEl, "explore_save_selection", "ask-graph-save", null, () => void this.save());
    }

    /** Every button on this surface: labelled for a screen reader, whatever it shows on screen. */
    private button(
        parent: HTMLElement,
        labelKey: LocaleKey,
        cls: string,
        glyph: string | null,
        onClick: () => void
    ): HTMLElement {
        const btn = parent.createEl("button", { cls: c(cls), text: glyph ?? t(labelKey) });
        btn.setAttribute("aria-label", t(labelKey));
        this.registerDomEvent(btn, "click", onClick);
        return btn;
    }

    /** Take the answer, say how big it is, and hand it to the active lens. */
    private renderAnswer(matches: Matches, total: number): void {
        if (!this.statusEl) return;
        this.matches = matches;
        this.statusEl.textContent =
            matches.length === 0
                ? t("ask_graph_no_results")
                : matches.length === total
                  ? t("explore_all_notes", String(total))
                  : t("ask_graph_result_count", String(matches.length));
        this.renderResults();
    }

    /**
     * Draw the selection already computed. The graph lens is **not** torn down and rebuilt on every
     * vault event: a 3D layout takes seconds to settle, so an existing one is re-lit in place and
     * only a lens change builds or drops it.
     */
    private renderResults(): void {
        if (!this.resultsEl) return;
        if (this.lens === "graph") {
            const lit = new Set(this.matches.map((match) => match.path));
            if (this.graphLens) {
                this.graphLens.setLit(lit);
                return;
            }
            this.resultsEl.empty();
            this.graphLens = new Graph3DRenderer(this.resultsEl.createDiv({ cls: c("ask-graph-graph") }), this.app, lit);
            this.addChild(this.graphLens);
            return;
        }
        if (this.graphLens) {
            this.removeChild(this.graphLens);
            this.graphLens = null;
        }
        this.resultsEl.empty();
        if (this.matches.length > 0) this.renderList(this.matches);
    }

    /** The note's name, wherever a lens puts it: titled with its path, and it opens the note. */
    private noteName(parent: HTMLElement, path: string): void {
        const name = parent.createSpan({ cls: c("ask-graph-result-name"), text: basename(path) });
        name.setAttribute("title", path);
        makeActivatable(name, () => this.openNote(path));
    }

    /** The list lens: one row per match, opening in place (persistent — the tab stays open). */
    private renderList(matches: Matches): void {
        if (!this.resultsEl) return;
        for (const match of matches) {
            const row = this.resultsEl.createDiv({ cls: c("ask-graph-result") });
            this.noteName(row, match.path);
            row.createSpan({
                cls: c("ask-graph-result-meta"),
                text: `${match.state} · ${match.maturitySignals.degree}`,
            });
        }
    }

    private savedQueries(): SavedGraphQuery[] {
        return normalizeSavedQueries(ObsidianApi.getOwnPlugin()?.settings.savedGraphQueries);
    }

    /** Apply a pure list transform, persist it, and re-render — the one write path for saved queries. */
    private async mutateSaved(transform: (list: SavedGraphQuery[]) => SavedGraphQuery[]): Promise<void> {
        const plugin = ObsidianApi.getOwnPlugin();
        if (!plugin) return;
        plugin.settings.savedGraphQueries = transform(this.savedQueries());
        await plugin.saveSettings();
        this.renderSaved();
    }

    private save(): void {
        void this.mutateSaved((list) => addSavedQuery(list, this.query));
    }

    private renderSaved(): void {
        if (!this.savedEl) return;
        this.savedEl.empty();
        const saved = this.savedQueries();
        if (saved.length === 0) return;
        this.savedEl.createEl("h6", { text: t("ask_graph_saved_heading") });
        const list = this.savedEl.createEl("ul", { cls: c("ask-graph-saved-list") });
        for (const entry of saved) this.renderSavedRow(list, entry);
    }

    /** One saved-query row: run it, rename, pin-to-Home (#323 G4), delete. */
    private renderSavedRow(list: HTMLElement, entry: SavedGraphQuery): void {
        const li = list.createEl("li", { cls: c("ask-graph-saved-item") });
        const label = li.createEl("code", {
            cls: c("ask-graph-saved-query"),
            text: savedQueryLabel(entry),
        });
        label.setAttribute("title", entry.query);
        makeActivatable(label, () => this.setQuery(entry.query));

        const actions = li.createDiv({ cls: c("ask-graph-saved-actions") });
        this.button(actions, "ask_graph_rename", "ask-graph-saved-rename", null, () => this.renameSaved(entry, label));
        this.button(actions, entry.pinned ? "ask_graph_unpin" : "ask_graph_pin", "ask-graph-saved-pin", null, () =>
            void this.mutateSaved((l) => togglePinnedQuery(l, entry.query))
        ).toggleClass(c("ask-graph-saved-pin--on"), entry.pinned === true);
        this.button(actions, "ask_graph_delete", "ask-graph-saved-delete", null, () =>
            void this.mutateSaved((l) => removeSavedQuery(l, entry.query))
        );
    }

    /** Inline rename: swap the label for a text field, commit on Enter/blur, cancel on Escape. */
    private renameSaved(entry: SavedGraphQuery, label: HTMLElement): void {
        const input = createEl("input", { type: "text", cls: c("ask-graph-saved-rename-input") });
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
            else this.renderSaved();
        };
        this.registerDomEvent(input, "keydown", (evt) => {
            if (evt.key === "Enter") commit(true);
            else if (evt.key === "Escape") commit(false);
        });
        this.registerDomEvent(input, "blur", () => commit(true));
    }
}

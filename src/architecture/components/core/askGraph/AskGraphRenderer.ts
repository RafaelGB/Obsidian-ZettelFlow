import { App } from "obsidian";
import { c, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { runGraphQuery, GRAPH_QUERY_EXAMPLES, GRAPH_QUERY_PREDICATES, type GraphQueryResult } from "architecture/knowledge/state";
import { makeActivatable } from "architecture/components/core/a11y";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import type { SavedGraphQuery } from "config";
import {
    addSavedQuery,
    removeSavedQuery,
    renameSavedQuery,
    moveSavedQuery,
    togglePinnedQuery,
    normalizeSavedQueries,
    savedQueryLabel,
} from "./savedQueries";

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

const DEBOUNCE_MS = 400;

/** The result lenses (#323, G3): the same match set as a plain list or a structured table. */
const LENSES = ["list", "table"] as const;
type ResultLens = (typeof LENSES)[number];
type Matches = GraphQueryResult["matches"];

/**
 * **Ask your graph** as a first-class **surface mode** (#323, promotes the #318 S3 modal): a persistent
 * tab that stays open beside the note you're editing, runs the deterministic {@link runGraphQuery} engine
 * over the semantic graph + lifecycle (never AI), and **recomputes live** as the vault changes. Saved
 * queries persist in settings. Read-only; opening a result never closes the tab. Reuses the modal's
 * markup/classes verbatim so nothing is re-styled.
 */
export class AskGraphRenderer extends KnowledgeModeRenderer {
    private query = "";
    private input: HTMLInputElement | null = null;
    private statusEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private savedEl: HTMLElement | null = null;
    private debounceTimer: number | undefined;
    private lens: ResultLens = "list";
    private readonly lensButtons = new Map<ResultLens, HTMLElement>();

    constructor(container: HTMLElement, private readonly app: App, initialQuery?: string) {
        super(container);
        // Deep-link from a Home pinned card (#323 G4): open pre-filled and run immediately.
        if (initialQuery && initialQuery.trim() !== "") this.query = initialQuery.trim();
    }

    onload(): void {
        this.renderShell();
        // Live recompute (#323): a query and its results refresh as the vault changes.
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
        this.container.empty();
    }

    private renderShell(): void {
        const root = this.container.createDiv({ cls: c("ask-graph") });
        root.createDiv({ cls: c("ask-graph-intro"), text: t("ask_graph_intro") });

        const bar = root.createDiv({ cls: c("ask-graph-bar") });
        this.input = bar.createEl("input", { type: "text", cls: c("ask-graph-input") });
        this.input.placeholder = t("ask_graph_placeholder");
        this.input.setAttribute("aria-label", t("ask_graph_title"));
        this.input.value = this.query;
        this.registerDomEvent(this.input, "input", () => (this.query = this.input?.value ?? ""));
        this.registerDomEvent(this.input, "keydown", (evt) => {
            if (evt.key === "Enter") this.run();
        });
        const runBtn = bar.createEl("button", { text: t("ask_graph_run"), cls: c("ask-graph-run") });
        this.registerDomEvent(runBtn, "click", () => this.run());
        const saveBtn = bar.createEl("button", { text: t("ask_graph_save"), cls: c("ask-graph-save") });
        this.registerDomEvent(saveBtn, "click", () => void this.save());

        // Result lenses (#323, G3): the same matches as a list or a structured table.
        const lensBar = root.createDiv({ cls: c("ask-graph-lenses") });
        this.lensButtons.clear();
        for (const lens of LENSES) {
            const btn = lensBar.createEl("button", {
                text: t(`ask_graph_lens_${lens}` as Parameters<typeof t>[0]),
                cls: c("ask-graph-lens"),
            });
            btn.toggleClass(c("ask-graph-lens--active"), this.lens === lens);
            this.registerDomEvent(btn, "click", () => this.setLens(lens));
            this.lensButtons.set(lens, btn);
        }

        this.statusEl = root.createDiv({ cls: c("ask-graph-status") });
        this.resultsEl = root.createDiv({ cls: c("ask-graph-results") });
        this.savedEl = root.createDiv({ cls: c("ask-graph-saved") });
        this.renderSaved();
        this.renderExamples(root);
        this.renderPredicateHelp(root);
        this.run();
    }

    private setQuery(next: string): void {
        this.query = next;
        if (this.input) this.input.value = next;
        this.run();
    }

    private setLens(lens: ResultLens): void {
        this.lens = lens;
        for (const [id, btn] of this.lensButtons) btn.toggleClass(c("ask-graph-lens--active"), id === lens);
        this.run();
    }

    private openNote(path: string): void {
        void this.app.workspace.openLinkText(path, "", false);
    }

    private run(): void {
        if (!this.resultsEl || !this.statusEl) return;
        this.resultsEl.empty();
        this.statusEl.textContent = "";
        // A persistent tab stays quiet until you ask something (unlike the old modal, which nagged).
        if (this.query.trim() === "") return;

        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") {
            this.statusEl.textContent = t("ask_graph_indexing");
            return;
        }
        const result = runGraphQuery(index.getModel(), this.query);
        if (result.error) {
            this.statusEl.textContent = result.error;
            return;
        }
        if (result.matches.length === 0) {
            this.statusEl.textContent = t("ask_graph_no_results");
            return;
        }
        this.statusEl.textContent = t("ask_graph_result_count", String(result.matches.length));
        if (this.lens === "table") this.renderTable(result.matches);
        else this.renderList(result.matches);
    }

    /** The list lens: one row per match, opening in place (persistent — the tab stays open). */
    private renderList(matches: Matches): void {
        if (!this.resultsEl) return;
        for (const match of matches) {
            const row = this.resultsEl.createDiv({ cls: c("ask-graph-result") });
            const name = row.createSpan({ cls: c("ask-graph-result-name"), text: basename(match.path) });
            name.setAttribute("title", match.path);
            makeActivatable(name, () => this.openNote(match.path));
            row.createSpan({
                cls: c("ask-graph-result-meta"),
                text: `${match.state} · ${match.maturitySignals.degree}`,
            });
        }
    }

    /** The table lens (#323, G3): note · state · degree · sources, for scanning a result set structurally. */
    private renderTable(matches: Matches): void {
        if (!this.resultsEl) return;
        const table = this.resultsEl.createEl("table", { cls: c("ask-graph-table") });
        const headRow = table.createEl("thead").createEl("tr");
        for (const col of ["note", "state", "degree", "sources"] as const) {
            headRow.createEl("th", { text: t(`ask_graph_col_${col}` as Parameters<typeof t>[0]) });
        }
        const tbody = table.createEl("tbody");
        for (const match of matches) {
            const tr = tbody.createEl("tr", { cls: c("ask-graph-table-row") });
            const name = tr.createEl("td").createSpan({ cls: c("ask-graph-result-name"), text: basename(match.path) });
            name.setAttribute("title", match.path);
            makeActivatable(name, () => this.openNote(match.path));
            tr.createEl("td", { text: match.state });
            tr.createEl("td", { text: String(match.maturitySignals.degree) });
            tr.createEl("td", { text: match.maturitySignals.hasSources ? "✓" : "—" });
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

    /** One saved-query row: run it, rename, reorder, pin-to-Home (#323 G4), delete. */
    private renderSavedRow(list: HTMLElement, entry: SavedGraphQuery): void {
        const li = list.createEl("li", { cls: c("ask-graph-saved-item") });
        const label = li.createEl("code", {
            cls: c("ask-graph-saved-query"),
            text: savedQueryLabel(entry),
        });
        label.setAttribute("title", entry.query);
        makeActivatable(label, () => this.setQuery(entry.query));

        const actions = li.createDiv({ cls: c("ask-graph-saved-actions") });
        this.savedAction(actions, "ask_graph_rename", "ask-graph-saved-rename", () => this.renameSaved(entry, label));
        this.savedAction(actions, "ask_graph_move_up", "ask-graph-saved-up", () =>
            void this.mutateSaved((l) => moveSavedQuery(l, entry.query, "up"))
        );
        this.savedAction(actions, "ask_graph_move_down", "ask-graph-saved-down", () =>
            void this.mutateSaved((l) => moveSavedQuery(l, entry.query, "down"))
        );
        this.savedAction(actions, entry.pinned ? "ask_graph_unpin" : "ask_graph_pin", "ask-graph-saved-pin", () =>
            void this.mutateSaved((l) => togglePinnedQuery(l, entry.query))
        ).toggleClass(c("ask-graph-saved-pin--on"), entry.pinned === true);
        this.savedAction(actions, "ask_graph_delete", "ask-graph-saved-delete", () =>
            void this.mutateSaved((l) => removeSavedQuery(l, entry.query))
        );
    }

    private savedAction(parent: HTMLElement, labelKey: Parameters<typeof t>[0], cls: string, onClick: () => void): HTMLElement {
        const btn = parent.createEl("button", { cls: c(cls), text: t(labelKey) });
        btn.setAttribute("aria-label", t(labelKey));
        this.registerDomEvent(btn, "click", onClick);
        return btn;
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

    private renderExamples(root: HTMLElement): void {
        root.createEl("h6", { text: t("ask_graph_examples_heading") });
        const list = root.createEl("ul", { cls: c("ask-graph-examples") });
        for (const example of GRAPH_QUERY_EXAMPLES) {
            const li = list.createEl("li", { cls: c("ask-graph-example") });
            li.createSpan({ cls: c("ask-graph-example-label"), text: example.label });
            const code = li.createEl("code", { cls: c("ask-graph-example-query"), text: example.query });
            makeActivatable(code, () => this.setQuery(example.query));
        }
    }

    private renderPredicateHelp(root: HTMLElement): void {
        root.createEl("h6", { text: t("ask_graph_predicates_heading") });
        const table = root.createEl("table", { cls: c("ask-graph-predicates") });
        const tbody = table.createEl("tbody");
        for (const predicate of GRAPH_QUERY_PREDICATES) {
            const tr = tbody.createEl("tr");
            tr.createEl("td").createEl("code", { text: predicate.token });
            tr.createEl("td", { text: predicate.note });
        }
    }
}

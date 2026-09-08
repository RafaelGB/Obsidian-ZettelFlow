import { App } from "obsidian";
import { c, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { runGraphQuery, GRAPH_QUERY_EXAMPLES, GRAPH_QUERY_PREDICATES } from "architecture/knowledge/state";
import { makeActivatable } from "architecture/components/core/a11y";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { addSavedQuery, removeSavedQuery } from "./savedQueries";

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

const DEBOUNCE_MS = 400;

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

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
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
        for (const match of result.matches) {
            const row = this.resultsEl.createDiv({ cls: c("ask-graph-result") });
            const name = row.createSpan({ cls: c("ask-graph-result-name"), text: basename(match.path) });
            name.setAttribute("title", match.path);
            // Persistent: open the note in place, keep the query tab open (unlike the modal).
            makeActivatable(name, () => void this.app.workspace.openLinkText(match.path, "", false));
            row.createSpan({
                cls: c("ask-graph-result-meta"),
                text: `${match.state} · ${match.maturitySignals.degree}`,
            });
        }
    }

    private async save(): Promise<void> {
        const plugin = ObsidianApi.getOwnPlugin();
        if (!plugin) return;
        plugin.settings.savedGraphQueries = addSavedQuery(plugin.settings.savedGraphQueries ?? [], this.query);
        await plugin.saveSettings();
        this.renderSaved();
    }

    private async deleteSaved(query: string): Promise<void> {
        const plugin = ObsidianApi.getOwnPlugin();
        if (!plugin) return;
        plugin.settings.savedGraphQueries = removeSavedQuery(plugin.settings.savedGraphQueries ?? [], query);
        await plugin.saveSettings();
        this.renderSaved();
    }

    private renderSaved(): void {
        if (!this.savedEl) return;
        this.savedEl.empty();
        const saved = ObsidianApi.getOwnPlugin()?.settings.savedGraphQueries ?? [];
        if (saved.length === 0) return;
        this.savedEl.createEl("h6", { text: t("ask_graph_saved_heading") });
        const list = this.savedEl.createEl("ul", { cls: c("ask-graph-saved-list") });
        for (const query of saved) {
            const li = list.createEl("li", { cls: c("ask-graph-saved-item") });
            const label = li.createEl("code", { cls: c("ask-graph-saved-query"), text: query });
            makeActivatable(label, () => this.setQuery(query));
            const del = li.createEl("button", { cls: c("ask-graph-saved-delete"), text: t("ask_graph_delete") });
            del.setAttribute("aria-label", t("ask_graph_delete"));
            this.registerDomEvent(del, "click", () => void this.deleteSaved(query));
        }
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

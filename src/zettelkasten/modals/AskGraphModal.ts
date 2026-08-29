import { Modal } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    runGraphQuery,
    GRAPH_QUERY_EXAMPLES,
    GRAPH_QUERY_PREDICATES,
} from "architecture/knowledge/state";
import { makeActivatable } from "architecture/components/core/a11y";
import type ZettelFlow from "main";

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/**
 * **Ask your graph** (#318 S3) — a read-only surface for the deterministic {@link runGraphQuery} engine.
 * Type (or pick) a composable query over the semantic graph — `state:`, `relation:`, `degree>=`,
 * `orphan`, `unsourced`, `older-than:` … combined with `AND`/`OR` — run it, and open any result. Useful
 * queries can be **saved** (persisted in settings) to re-run later. Offline; never writes.
 */
export class AskGraphModal extends Modal {
    private query = "";
    private input!: HTMLInputElement;
    private statusEl!: HTMLElement;
    private resultsEl!: HTMLElement;
    private savedEl!: HTMLElement;

    constructor(private readonly plugin: ZettelFlow) {
        super(plugin.app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass(c("ask-graph"));
        contentEl.createEl("h2", { text: t("ask_graph_title") });
        contentEl.createDiv({ cls: c("ask-graph-intro"), text: t("ask_graph_intro") });

        const bar = contentEl.createDiv({ cls: c("ask-graph-bar") });
        this.input = bar.createEl("input", { type: "text", cls: c("ask-graph-input") });
        this.input.placeholder = t("ask_graph_placeholder");
        this.input.setAttribute("aria-label", t("ask_graph_title"));
        this.input.addEventListener("input", () => (this.query = this.input.value));
        this.input.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") this.run();
        });
        bar.createEl("button", { text: t("ask_graph_run"), cls: c("ask-graph-run") }).addEventListener("click", () => this.run());
        bar.createEl("button", { text: t("ask_graph_save"), cls: c("ask-graph-save") }).addEventListener("click", () => void this.save());

        this.statusEl = contentEl.createDiv({ cls: c("ask-graph-status") });
        this.resultsEl = contentEl.createDiv({ cls: c("ask-graph-results") });

        this.savedEl = contentEl.createDiv({ cls: c("ask-graph-saved") });
        this.renderSaved();
        this.renderExamples(contentEl);
        this.renderPredicateHelp(contentEl);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private setQuery(next: string): void {
        this.query = next;
        this.input.value = next;
        this.run();
    }

    private run(): void {
        this.resultsEl.empty();
        this.statusEl.textContent = "";
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
            makeActivatable(name, () => {
                void this.app.workspace.openLinkText(match.path, "", false);
                this.close();
            });
            row.createSpan({
                cls: c("ask-graph-result-meta"),
                text: `${match.state} · ${match.maturitySignals.degree}`,
            });
        }
    }

    private async save(): Promise<void> {
        const query = this.query.trim();
        if (query === "") return;
        const saved = this.plugin.settings.savedGraphQueries ?? [];
        if (!saved.includes(query)) {
            this.plugin.settings.savedGraphQueries = [...saved, query];
            await this.plugin.saveSettings();
            this.renderSaved();
        }
    }

    private renderSaved(): void {
        this.savedEl.empty();
        const saved = this.plugin.settings.savedGraphQueries ?? [];
        if (saved.length === 0) return;
        this.savedEl.createEl("h6", { text: t("ask_graph_saved_heading") });
        const list = this.savedEl.createEl("ul", { cls: c("ask-graph-saved-list") });
        for (const query of saved) {
            const li = list.createEl("li", { cls: c("ask-graph-saved-item") });
            const label = li.createEl("code", { cls: c("ask-graph-saved-query"), text: query });
            makeActivatable(label, () => this.setQuery(query));
            const del = li.createEl("button", { cls: c("ask-graph-saved-delete"), text: t("ask_graph_delete") });
            del.setAttribute("aria-label", t("ask_graph_delete"));
            del.addEventListener("click", () => void this.deleteSaved(query));
        }
    }

    private async deleteSaved(query: string): Promise<void> {
        const saved = this.plugin.settings.savedGraphQueries ?? [];
        this.plugin.settings.savedGraphQueries = saved.filter((q) => q !== query);
        await this.plugin.saveSettings();
        this.renderSaved();
    }

    private renderExamples(contentEl: HTMLElement): void {
        contentEl.createEl("h6", { text: t("ask_graph_examples_heading") });
        const list = contentEl.createEl("ul", { cls: c("ask-graph-examples") });
        for (const example of GRAPH_QUERY_EXAMPLES) {
            const li = list.createEl("li", { cls: c("ask-graph-example") });
            li.createSpan({ cls: c("ask-graph-example-label"), text: example.label });
            const code = li.createEl("code", { cls: c("ask-graph-example-query"), text: example.query });
            makeActivatable(code, () => this.setQuery(example.query));
        }
    }

    private renderPredicateHelp(contentEl: HTMLElement): void {
        contentEl.createEl("h6", { text: t("ask_graph_predicates_heading") });
        const table = contentEl.createEl("table", { cls: c("ask-graph-predicates") });
        const tbody = table.createEl("tbody");
        for (const predicate of GRAPH_QUERY_PREDICATES) {
            const row = tbody.createEl("tr");
            row.createEl("td").createEl("code", { text: predicate.token });
            row.createEl("td", { text: predicate.note });
        }
    }
}

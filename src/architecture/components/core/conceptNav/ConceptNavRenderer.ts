import { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex, knowledgeQueries, type KnowledgeModel } from "architecture/knowledge";
import { ConceptNeighbors, conceptNeighbors } from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";

const DEBOUNCE_MS = 400;

type ViewState = "indexing" | "entry" | "focused" | "empty" | "error";

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * The **Navigate** mode of the Graph surface (#272, formerly `ConceptNavView`, #166): walk the vault
 * like a wiki you wrote — a focus note shows its typed neighbours; clicking one re-focuses the pane.
 * With no focus it seeds from the active note, else the vault's hubs. Read-only; render byte-identical.
 */
export class ConceptNavRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private model: KnowledgeModel | null = null;
    private focus: string | null = null;
    private userChoseHubs = false;
    private neighbors: ConceptNeighbors | null = null;
    private entryHubs: string[] = [];
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
                this.model = null;
                this.render();
                return;
            }
            const start = Date.now();
            this.model = index.getModel();
            if (this.focus && !this.model.get(this.focus)) this.focus = null;
            if (!this.focus && !this.userChoseHubs) {
                const active = this.app.workspace.getActiveFile();
                if (active && this.model.get(active.path)) this.focus = active.path;
            }
            this.deriveState();
            log.debug(`[ConceptNav] recomputed (focus=${this.focus ?? "none"}) in ${Date.now() - start}ms`);
        } catch (error) {
            this.state = "error";
            log.error(`[ConceptNav] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private deriveState(): void {
        if (!this.model) return;
        if (this.focus) {
            this.neighbors = conceptNeighbors(this.model, this.focus);
            this.state = "focused";
        } else {
            this.entryHubs = knowledgeQueries.hubs(this.model).map((hub) => hub.path).sort();
            this.state = this.entryHubs.length === 0 ? "empty" : "entry";
        }
    }

    private focusOn(path: string): void {
        this.focus = path;
        this.userChoseHubs = false;
        if (this.model) {
            this.deriveState();
            this.render();
        }
    }

    private render(): void {
        const host = this.container;
        host.empty();
        const container = host.createDiv({ cls: c("concept-nav") });

        const header = container.createDiv({ cls: c("concept-nav-header") });
        header.createEl("h4", { text: t("concept_nav_view_title"), cls: c("concept-nav-title") });
        const refresh = header.createEl("button", {
            text: t("concept_nav_refresh_button"),
            cls: c("concept-nav-refresh"),
            attr: { "aria-label": t("concept_nav_refresh_button") },
        });
        refresh.addEventListener("click", () => this.recompute());

        if (this.state === "indexing") {
            container.createDiv({ cls: c("concept-nav-status"), text: t("concept_nav_indexing") });
            return;
        }
        if (this.state === "error") {
            container.createDiv({ cls: c("concept-nav-status"), text: t("concept_nav_error") });
            return;
        }
        if (this.state === "empty") {
            container.createDiv({ cls: c("concept-nav-status"), text: t("concept_nav_empty") });
            return;
        }
        if (this.state === "entry") {
            this.renderEntry(container);
            return;
        }
        this.renderFocused(container);
    }

    private renderEntry(container: HTMLElement): void {
        container.createEl("h5", { text: t("concept_nav_entry_heading"), cls: c("concept-nav-heading") });
        const list = container.createDiv({ cls: c("concept-nav-list") });
        for (const path of this.entryHubs) this.renderNavRow(list, path);
    }

    private renderFocused(container: HTMLElement): void {
        const neighbors = this.neighbors;
        if (!neighbors) return;

        const focusRow = container.createDiv({ cls: c("concept-nav-focus") });
        const name = focusRow.createSpan({ text: basename(neighbors.focus), cls: c("concept-nav-focus-name") });
        name.setAttribute("title", neighbors.focus);
        name.addEventListener("click", () => void this.app.workspace.openLinkText(neighbors.focus, "", false));
        const back = focusRow.createEl("button", {
            text: t("concept_nav_back_button"),
            cls: c("concept-nav-back"),
            attr: { "aria-label": t("concept_nav_back_button") },
        });
        back.addEventListener("click", () => {
            this.focus = null;
            this.userChoseHubs = true;
            this.deriveState();
            this.render();
        });

        if (neighbors.groups.length === 0) {
            container.createDiv({ cls: c("concept-nav-status"), text: t("concept_nav_empty") });
            return;
        }

        let lastDirection: "out" | "in" | null = null;
        for (const group of neighbors.groups) {
            if (group.direction !== lastDirection) {
                const heading = group.direction === "out" ? t("concept_nav_out_heading") : t("concept_nav_in_heading");
                container.createEl("h5", { text: heading, cls: c("concept-nav-heading") });
                lastDirection = group.direction;
            }
            const section = container.createDiv({ cls: c("concept-nav-group") });
            section.createSpan({ text: group.type, cls: c("concept-nav-type") });
            const list = section.createDiv({ cls: c("concept-nav-list") });
            for (const target of group.targets) this.renderNavRow(list, target);
        }
    }

    private renderNavRow(list: HTMLElement, path: string): void {
        const row = list.createDiv({ cls: c("concept-nav-row") });
        const name = row.createSpan({ text: basename(path), cls: c("concept-nav-row-name") });
        name.setAttribute("title", path);
        name.addEventListener("click", () => this.focusOn(path));
    }
}

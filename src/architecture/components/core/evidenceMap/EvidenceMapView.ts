import { ItemView, WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { EvidenceEntry, EvidenceMap, buildEvidenceMap } from "architecture/knowledge/state";

const DEBOUNCE_MS = 400;

type ViewState = "indexing" | "no-active" | "empty" | "ready" | "error";

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * **Evidence map** (#169, experimental): a transparent, grounded synthesis of the ACTIVE note from
 * your own graph — what supports it, what contradicts it, the sourced evidence, and the gaps. Every
 * row links to a real note; nothing is invented, no AI. Read-only; `createEl`/`c()` only.
 */
export class EvidenceMapView extends ItemView {
    static readonly NAME = "zettelflow-evidence-map";

    private state: ViewState = "indexing";
    private map: EvidenceMap | null = null;
    private debounceTimer: number | undefined;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return EvidenceMapView.NAME;
    }

    getDisplayText(): string {
        return t("evidence_map_view_title");
    }

    getIcon(): string {
        return "scale";
    }

    async onOpen(): Promise<void> {
        this.registerVaultListeners();
        this.recompute();
    }

    async onClose(): Promise<void> {
        window.clearTimeout(this.debounceTimer);
        this.contentEl.empty();
    }

    private registerVaultListeners(): void {
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.recompute(), DEBOUNCE_MS);
        };
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
        this.registerEvent(this.app.workspace.on("active-leaf-change", debounced));
    }

    private recompute(): void {
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "indexing";
                this.map = null;
                this.render();
                return;
            }
            const active = this.app.workspace.getActiveFile();
            if (!active) {
                this.state = "no-active";
                this.map = null;
                this.render();
                return;
            }
            const start = Date.now();
            this.map = buildEvidenceMap(index.getModel(), active.path);
            this.state = this.isEmpty(this.map) ? "empty" : "ready";
            log.debug(`[EvidenceMap] built for ${active.path} in ${Date.now() - start}ms`);
        } catch (error) {
            this.state = "error";
            log.error(`[EvidenceMap] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private isEmpty(map: EvidenceMap): boolean {
        return (
            map.supports.length === 0 &&
            map.contradicts.length === 0 &&
            map.evidence.length === 0 &&
            map.gaps.unsourcedClaims.length === 0 &&
            map.gaps.openQuestions.length === 0
        );
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        const container = contentEl.createDiv({ cls: c("evidence-map") });

        const header = container.createDiv({ cls: c("evidence-map-header") });
        header.createEl("h4", { text: t("evidence_map_view_title"), cls: c("evidence-map-title") });
        const refresh = header.createEl("button", {
            text: t("evidence_map_refresh_button"),
            cls: c("evidence-map-refresh"),
            attr: { "aria-label": t("evidence_map_refresh_button") },
        });
        refresh.addEventListener("click", () => this.recompute());

        if (this.state === "indexing") {
            container.createDiv({ cls: c("evidence-map-status"), text: t("evidence_map_indexing") });
            return;
        }
        if (this.state === "error") {
            container.createDiv({ cls: c("evidence-map-status"), text: t("evidence_map_error") });
            return;
        }
        if (this.state === "no-active") {
            container.createDiv({ cls: c("evidence-map-status"), text: t("evidence_map_no_active_note") });
            return;
        }
        if (this.state === "empty" || !this.map) {
            container.createDiv({ cls: c("evidence-map-status"), text: t("evidence_map_empty") });
            return;
        }

        this.renderNoteSection(container, "evidence_map_supports_heading", this.map.supports);
        this.renderNoteSection(container, "evidence_map_contradicts_heading", this.map.contradicts);
        this.renderEvidenceSection(container, this.map.evidence);
        this.renderGapsSection(container, this.map.gaps);
    }

    private renderNoteSection(container: HTMLElement, headingKey: Parameters<typeof t>[0], paths: string[]): void {
        const section = container.createDiv({ cls: c("evidence-map-section") });
        section.createEl("h5", { text: t(headingKey), cls: c("evidence-map-heading") });
        if (paths.length === 0) {
            section.createDiv({ cls: c("evidence-map-section-empty"), text: t("evidence_map_section_empty") });
            return;
        }
        const list = section.createDiv({ cls: c("evidence-map-list") });
        for (const path of paths) this.renderNoteRow(list, path);
    }

    private renderEvidenceSection(container: HTMLElement, evidence: EvidenceEntry[]): void {
        const section = container.createDiv({ cls: c("evidence-map-section") });
        section.createEl("h5", { text: t("evidence_map_evidence_heading"), cls: c("evidence-map-heading") });
        if (evidence.length === 0) {
            section.createDiv({ cls: c("evidence-map-section-empty"), text: t("evidence_map_section_empty") });
            return;
        }
        const list = section.createDiv({ cls: c("evidence-map-list") });
        for (const entry of evidence) {
            const row = list.createDiv({ cls: c("evidence-map-evidence") });
            row.createDiv({ text: entry.claim, cls: c("evidence-map-claim") });
            const meta = row.createDiv({ cls: c("evidence-map-meta") });
            const note = meta.createSpan({ text: basename(entry.note), cls: c("evidence-map-note") });
            note.setAttribute("title", entry.note);
            note.addEventListener("click", () => void this.app.workspace.openLinkText(entry.note, "", false));
            meta.createSpan({ text: ` · ${entry.source.ref}`, cls: c("evidence-map-source") });
        }
    }

    private renderGapsSection(container: HTMLElement, gaps: EvidenceMap["gaps"]): void {
        const section = container.createDiv({ cls: c("evidence-map-section") });
        section.createEl("h5", { text: t("evidence_map_gaps_heading"), cls: c("evidence-map-heading") });

        const unsourced = section.createDiv({ cls: c("evidence-map-subsection") });
        unsourced.createSpan({ text: t("evidence_map_unsourced_claims_label"), cls: c("evidence-map-sublabel") });
        if (gaps.unsourcedClaims.length === 0) {
            unsourced.createSpan({ text: ` ${t("evidence_map_section_empty")}`, cls: c("evidence-map-section-empty") });
        } else {
            const list = unsourced.createDiv({ cls: c("evidence-map-list") });
            for (const item of gaps.unsourcedClaims) list.createDiv({ text: item.claim, cls: c("evidence-map-claim") });
        }

        const questions = section.createDiv({ cls: c("evidence-map-subsection") });
        questions.createSpan({ text: t("evidence_map_open_questions_label"), cls: c("evidence-map-sublabel") });
        if (gaps.openQuestions.length === 0) {
            questions.createSpan({ text: ` ${t("evidence_map_section_empty")}`, cls: c("evidence-map-section-empty") });
        } else {
            const list = questions.createDiv({ cls: c("evidence-map-list") });
            for (const path of gaps.openQuestions) this.renderNoteRow(list, path);
        }
    }

    private renderNoteRow(list: HTMLElement, path: string): void {
        const row = list.createDiv({ cls: c("evidence-map-row") });
        const name = row.createSpan({ text: basename(path), cls: c("evidence-map-row-name") });
        name.setAttribute("title", path);
        name.addEventListener("click", () => void this.app.workspace.openLinkText(path, "", false));
    }
}

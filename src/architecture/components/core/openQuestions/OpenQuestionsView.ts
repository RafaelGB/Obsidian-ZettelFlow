import { ItemView, WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex, type KnowledgeModel } from "architecture/knowledge";
import { OpenQuestion, openQuestions, proposeAnswers } from "architecture/knowledge/state";

const DEBOUNCE_MS = 400;

type ViewState = "indexing" | "ready" | "empty" | "error";

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * **Open questions** (#167): lists every unanswered question across the vault — its asker(s) and the
 * notes most likely to answer it (the #154 relatedness heuristic). Read-only: rows open notes, the
 * proposed `supports` link is shown but not written. Auto-updates via debounced listeners (mirroring
 * the concept-navigation pane). `createEl`/`c()` only; no innerHTML/inline styles.
 */
export class OpenQuestionsView extends ItemView {
    static readonly NAME = "zettelflow-open-questions";

    private state: ViewState = "indexing";
    private model: KnowledgeModel | null = null;
    private questions: OpenQuestion[] = [];
    private debounceTimer: number | undefined;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return OpenQuestionsView.NAME;
    }

    getDisplayText(): string {
        return t("open_questions_view_title");
    }

    getIcon(): string {
        return "circle-help";
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
            this.questions = openQuestions(this.model);
            this.state = this.questions.length === 0 ? "empty" : "ready";
            log.debug(`[OpenQuestions] ${this.questions.length} open in ${Date.now() - start}ms`);
        } catch (error) {
            this.state = "error";
            log.error(`[OpenQuestions] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        const container = contentEl.createDiv({ cls: c("open-questions") });

        const header = container.createDiv({ cls: c("open-questions-header") });
        header.createEl("h4", { text: t("open_questions_view_title"), cls: c("open-questions-title") });
        const refresh = header.createEl("button", {
            text: t("open_questions_refresh_button"),
            cls: c("open-questions-refresh"),
            attr: { "aria-label": t("open_questions_refresh_button") },
        });
        refresh.addEventListener("click", () => this.recompute());

        if (this.state === "indexing") {
            container.createDiv({ cls: c("open-questions-status"), text: t("open_questions_indexing") });
            return;
        }
        if (this.state === "error") {
            container.createDiv({ cls: c("open-questions-status"), text: t("open_questions_error") });
            return;
        }
        if (this.state === "empty") {
            container.createDiv({ cls: c("open-questions-status"), text: t("open_questions_empty") });
            return;
        }

        for (const question of this.questions) this.renderQuestion(container, question);
    }

    private renderQuestion(container: HTMLElement, question: OpenQuestion): void {
        const section = container.createDiv({ cls: c("open-questions-item") });
        const title = section.createEl("h5", { cls: c("open-questions-q") });
        const name = title.createSpan({ text: basename(question.path), cls: c("open-questions-q-name") });
        name.setAttribute("title", question.path);
        name.addEventListener("click", () => void this.app.workspace.openLinkText(question.path, "", false));

        const asked = section.createDiv({ cls: c("open-questions-line") });
        asked.createSpan({ text: t("open_questions_asked_by"), cls: c("open-questions-label") });
        const askedList = asked.createDiv({ cls: c("open-questions-refs") });
        for (const asker of question.askedBy) this.renderRef(askedList, asker);

        const candidates = this.model ? proposeAnswers(this.model, question.path) : [];
        const answers = section.createDiv({ cls: c("open-questions-line") });
        answers.createSpan({ text: t("open_questions_proposed_answers"), cls: c("open-questions-label") });
        if (candidates.length === 0) {
            answers.createSpan({ text: t("open_questions_no_answer"), cls: c("open-questions-no-answer") });
            return;
        }
        const answerList = answers.createDiv({ cls: c("open-questions-refs") });
        for (const candidate of candidates) this.renderRef(answerList, candidate.path);
    }

    private renderRef(list: HTMLElement, path: string): void {
        const name = list.createSpan({ text: basename(path), cls: c("open-questions-ref") });
        name.setAttribute("title", path);
        name.addEventListener("click", () => void this.app.workspace.openLinkText(path, "", false));
    }
}

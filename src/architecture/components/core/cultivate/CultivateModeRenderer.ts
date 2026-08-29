import ZettelFlow from "main";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { CultivationService, DevelopmentJournal } from "architecture/plugin";
import { KnowledgeIndex } from "architecture/knowledge";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import {
    buildCultivationSession,
    selectCultivationTarget,
    cultivationQueue,
    developmentStreak,
    type CultivationMove,
    type CultivationMoveKind,
    type CultivationSession,
} from "architecture/knowledge/state";

const DEBOUNCE_MS = 500;
type ViewState = "indexing" | "ready" | "empty" | "error";

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/**
 * The **Cultivate** mode (#309): a guided thinking session that walks the user through cognitive moves
 * on one idea — connect, challenge, question, advance, add a source — each applying a real operation
 * to the note. The session (pure {@link buildCultivationSession}) rebuilds live as moves land, so it
 * always shows "what to do next" on that idea. Offline; AI is never required.
 */
export class CultivateModeRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private session: CultivationSession | null = null;
    private targetPath: string | null = null;
    private queueCount = 0;
    private streak = 0;
    private readonly visited = new Set<string>();
    private debounceTimer: number | undefined;

    constructor(container: HTMLElement, private readonly plugin: ZettelFlow) {
        super(container);
    }

    private get app() {
        return this.plugin.app;
    }

    onload(): void {
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.recompute(), DEBOUNCE_MS);
        };
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
        this.recompute();
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        this.container.empty();
    }

    /** Move to a fresh, not-yet-cultivated idea. */
    private anotherIdea(): void {
        if (this.targetPath) this.visited.add(this.targetPath);
        this.targetPath = null;
        this.recompute();
    }

    private recompute(): void {
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "indexing";
                this.render();
                return;
            }
            const model = index.getModel();
            if (model.size() === 0) {
                this.state = "empty";
                this.render();
                return;
            }
            // Keep the current target across recomputes so applying a move refines the session in place.
            if (!this.targetPath || !model.get(this.targetPath)) {
                this.targetPath = selectCultivationTarget(model, this.visited) ?? selectCultivationTarget(model);
            }
            const recipe = this.plugin.settings.cultivateMoves as CultivationMoveKind[] | undefined;
            this.session = this.targetPath ? buildCultivationSession(model, this.targetPath, Date.now(), recipe) : null;
            this.queueCount = cultivationQueue(model, this.visited, 99).length;
            this.streak = developmentStreak(DevelopmentJournal.getInstance().dailyCounts(), Date.now());
            this.state = this.session ? "ready" : "empty";
        } catch (error) {
            this.state = "error";
            log.error(`[Cultivate] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const host = this.container;
        host.empty();
        const root = host.createDiv({ cls: c("cultivate") });

        const header = root.createDiv({ cls: c("cultivate-header") });
        header.createEl("h4", { text: t("cultivate_title"), cls: c("cultivate-title") });
        const another = header.createEl("button", {
            text: t("cultivate_another"),
            cls: c("cultivate-another"),
            attr: { "aria-label": t("cultivate_another") },
        });
        another.addEventListener("click", () => this.anotherIdea());

        if (this.state === "indexing") {
            root.createDiv({ cls: c("cultivate-status"), text: t("cultivate_building") });
            return;
        }
        if (this.state === "error") {
            root.createDiv({ cls: c("cultivate-status"), text: t("cultivate_error") });
            return;
        }
        if (this.state === "empty" || !this.session) {
            root.createDiv({ cls: c("cultivate-status"), text: t("cultivate_empty") });
            return;
        }

        root.createDiv({ cls: c("cultivate-intro"), text: t("cultivate_intro") });
        const momentum: string[] = [];
        if (this.streak > 0) momentum.push(t("cultivate_streak", String(this.streak)));
        if (this.queueCount > 0) momentum.push(t("cultivate_queue", String(this.queueCount)));
        if (momentum.length > 0) root.createDiv({ cls: c("cultivate-momentum"), text: momentum.join(" · ") });
        this.renderTarget(root, this.session);
        const list = root.createDiv({ cls: c("cultivate-moves") });
        for (const move of this.session.moves) this.renderMove(list, move);
    }

    private renderTarget(root: HTMLElement, session: CultivationSession): void {
        const card = root.createDiv({ cls: c("cultivate-target") });
        const name = card.createSpan({
            cls: c("cultivate-target-name"),
            text: `${session.stateEmoji} ${basename(session.path)}`.trim(),
        });
        name.setAttribute("title", session.path);
        name.addEventListener("click", () => void this.app.workspace.openLinkText(session.path, "", false));
        const maturity = session.maturity === null ? "—" : session.maturity.toFixed(2);
        card.createDiv({
            cls: c("cultivate-target-meta"),
            text: t("cultivate_target_meta", String(session.degree), maturity),
        });
    }

    private renderMove(list: HTMLElement, move: CultivationMove): void {
        const card = list.createDiv({ cls: [c("cultivate-move"), c(`cultivate-move--${move.kind}`)].join(" ") });
        card.createDiv({ cls: c("cultivate-move-title"), text: t(`cultivate_move_${move.kind}_title`) });
        card.createDiv({ cls: c("cultivate-move-desc"), text: t(`cultivate_move_${move.kind}_desc`) });
        const body = card.createDiv({ cls: c("cultivate-move-body") });

        switch (move.kind) {
            case "connect":
                this.renderConnect(body, move.candidates ?? []);
                break;
            case "challenge":
                this.renderChallenge(body, move.candidates ?? []);
                break;
            case "question":
                this.renderTextMove(body, "cultivate_question_placeholder", (text) => this.addQuestion(text));
                break;
            case "advance":
                this.renderAdvance(body, move);
                break;
            case "source":
                this.renderTextMove(body, "cultivate_source_placeholder", (text) => this.addSource(text));
                break;
        }
    }

    private renderConnect(body: HTMLElement, candidates: string[]): void {
        for (const candidate of candidates) {
            const row = body.createDiv({ cls: c("cultivate-candidate") });
            const link = row.createSpan({ cls: c("cultivate-candidate-name"), text: basename(candidate) });
            link.setAttribute("title", candidate);
            link.addEventListener("click", () => void this.app.workspace.openLinkText(candidate, "", false));
            const btn = row.createEl("button", { cls: c("cultivate-candidate-btn"), text: t("cultivate_link_button") });
            btn.addEventListener("click", () => void this.linkNote(candidate));
        }
    }

    private renderChallenge(body: HTMLElement, contradictions: string[]): void {
        if (contradictions.length > 0) {
            for (const path of contradictions) {
                const row = body.createDiv({ cls: c("cultivate-candidate") });
                const link = row.createSpan({ cls: c("cultivate-candidate-name"), text: basename(path) });
                link.setAttribute("title", path);
                link.addEventListener("click", () => void this.app.workspace.openLinkText(path, "", false));
            }
        } else {
            body.createDiv({ cls: c("cultivate-move-hint"), text: t("cultivate_no_contradictions") });
        }
        this.renderTextMove(body, "cultivate_counterpoint_placeholder", (text) => this.addCounterpoint(text));
    }

    private renderAdvance(body: HTMLElement, move: CultivationMove): void {
        const target = move.proposedState;
        if (!target) return;
        const label = move.proposedStateLabelKey ? t(move.proposedStateLabelKey as Parameters<typeof t>[0]) : target;
        const btn = body.createEl("button", {
            cls: c("cultivate-advance-btn"),
            text: t("cultivate_advance_button", label),
        });
        btn.addEventListener("click", () => void this.advanceState(target));
    }

    /** A one-line text input + add button, shared by question / source / counterpoint. */
    private renderTextMove(body: HTMLElement, placeholderKey: Parameters<typeof t>[0], apply: (text: string) => Promise<void>): void {
        const row = body.createDiv({ cls: c("cultivate-input-row") });
        const input = row.createEl("input", { type: "text", cls: c("cultivate-input") });
        input.placeholder = t(placeholderKey);
        input.setAttribute("aria-label", t(placeholderKey));
        const submit = () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = "";
            void apply(text);
        };
        input.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") submit();
        });
        const btn = row.createEl("button", { cls: c("cultivate-input-btn"), text: t("cultivate_add_button") });
        btn.addEventListener("click", () => submit());
    }

    // ── apply (#309 S3): delegate to the CultivationService (Workflow Engine owns the writes) ──────
    private readonly cultivation = CultivationService.getInstance();

    private linkNote(target: string): Promise<void> {
        return this.cultivation.link(this.app, this.targetPath ?? "", basename(target));
    }

    private addQuestion(text: string): Promise<void> {
        return this.cultivation.addQuestion(this.app, this.targetPath ?? "", text);
    }

    private addCounterpoint(text: string): Promise<void> {
        return this.cultivation.addCounterpoint(this.app, this.targetPath ?? "", text);
    }

    private addSource(text: string): Promise<void> {
        return this.cultivation.addSource(this.app, this.targetPath ?? "", text);
    }

    private advanceState(target: NonNullable<CultivationMove["proposedState"]>): Promise<void> {
        return this.cultivation.advance(this.app, this.plugin, this.targetPath ?? "", target);
    }
}

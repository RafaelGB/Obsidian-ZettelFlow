import { Component } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import {
    blindView,
    isMovement,
    MOVEMENTS,
    MOVEMENT_LABEL_KEY,
    type BlindState,
    type Revealed,
} from "application/thinking/blindReveal";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Think first, then look (#470, epic #465).
 *
 * When you ask your vault a question it answers immediately, and the moment it does your own
 * answer is gone. You never learn what you thought before you read it — and never notice that you
 * had already worked this out two years ago and forgot.
 *
 * So this waits. You answer; the answer is stored as a thought; **then** it looks.
 *
 * The leak this must not have is structural, not disciplinary: `blindView` does not return what
 * the vault holds until you have answered, so a careless re-render has nothing to show. This class
 * draws only what the view model gives it.
 */
export class BlindPanel extends Component {
    private state: BlindState = { question: "" };
    private answerDraft = "";

    constructor(
        private readonly host: HTMLElement,
        private readonly openNote: (path: string) => void
    ) {
        super();
    }

    onload(): void {
        this.render();
    }

    private render(): void {
        const view = blindView(this.state);
        this.host.empty();
        this.host.addClass(c("blind"));
        this.host.createEl("h4", { text: t("blind_title") });
        this.host.createDiv({ cls: c("blind-intro"), text: t("blind_intro") });

        const question = this.host.createEl("input", {
            type: "text",
            cls: c("blind-question"),
            attr: { placeholder: t("blind_question_placeholder") },
        });
        question.value = this.state.question;
        this.registerDomEvent(question, "input", () => (this.state.question = question.value));

        if (view.stage === "asking") {
            this.renderAsking();
            return;
        }
        this.renderRevealed(view.thought ?? "", view.knew, view.knewNothing);
    }

    /** The whole point: your answer, and nothing else on screen. */
    private renderAsking(): void {
        this.host.createDiv({ cls: c("blind-prompt"), text: t("blind_prompt") });
        const area = this.host.createEl("textarea", { cls: c("blind-answer"), attr: { rows: "3" } });
        area.value = this.answerDraft;
        this.registerDomEvent(area, "input", () => (this.answerDraft = area.value));

        const button = this.host.createEl("button", {
            text: t("blind_reveal"),
            cls: c("blind-action"),
            attr: { type: "button" },
        });
        this.registerDomEvent(button, "click", () => void this.reveal());
    }

    private renderRevealed(thought: string, knew: readonly Revealed[], knewNothing: boolean): void {
        const columns = this.host.createDiv({ cls: c("blind-columns") });

        const mine = columns.createDiv({ cls: c("blind-column") });
        mine.createEl("h5", { text: t("blind_you_thought") });
        mine.createDiv({ cls: c("blind-answer-text"), text: thought });

        const theirs = columns.createDiv({ cls: c("blind-column") });
        theirs.createEl("h5", { text: t("blind_you_knew") });
        if (knewNothing) {
            // A real answer, and often the interesting one.
            theirs.createDiv({ cls: c("blind-nothing"), text: t("blind_knew_nothing") });
        }
        for (const note of knew) {
            const row = theirs.createDiv({ cls: c("blind-note"), text: note.title });
            this.registerDomEvent(row, "click", () => this.openNote(note.path));
        }

        // Your words about your own mind. The system has no opinion on whether you were right.
        this.host.createDiv({ cls: c("blind-prompt"), text: t("blind_what_changed") });
        const movements = this.host.createDiv({ cls: c("blind-movements") });
        for (const movement of MOVEMENTS) {
            const chosen = this.state.movement === movement;
            const button = movements.createEl("button", {
                text: t(MOVEMENT_LABEL_KEY[movement] as LocaleKey),
                cls: chosen ? [c("blind-action"), c("blind-chosen")].join(" ") : c("blind-action"),
                attr: { type: "button" },
            });
            this.registerDomEvent(button, "click", () => this.say(movement));
        }

        const again = this.host.createEl("button", {
            text: t("blind_ask_another"),
            cls: c("blind-action"),
            attr: { type: "button" },
        });
        this.registerDomEvent(again, "click", () => {
            this.state = { question: "" };
            this.answerDraft = "";
            this.render();
        });
    }

    /** Store the answer first, then look. The order is the feature. */
    private async reveal(): Promise<void> {
        const answer = this.answerDraft.trim();
        if (!answer || !this.state.question.trim()) return;

        // Kept as a thought, before anything is revealed — so what you thought survives even if
        // you close the panel the moment you see what you knew.
        await ThoughtStore.getInstance().write(`${this.state.question}\n\n${answer}`);

        this.state = { ...this.state, answer, revealed: this.look(this.state.question) };
        this.render();
    }

    /** What the vault holds. The existing model, read plainly — no new query surface. */
    private look(question: string): Revealed[] {
        const words = [
            ...new Set(question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4)),
        ];
        if (words.length === 0) return [];
        try {
            return KnowledgeIndex.getInstance()
                .getModel()
                .all()
                .filter((idea) => words.some((word) => idea.title.toLowerCase().includes(word)))
                .slice(0, 8)
                .map((idea) => ({ path: idea.path, title: idea.title }));
        } catch (error) {
            log.warn("[lab] could not look at what you knew", error);
            return [];
        }
    }

    private say(movement: string): void {
        if (!isMovement(movement)) return;
        this.state = { ...this.state, movement };
        try {
            // A verdict about your own prior belief — the same log every other verdict goes to,
            // subject only, never content (#336).
            JudgementLog.getInstance().record({
                path: "",
                subject: `blind:${movement}`,
                origin: "human",
                verdict: movement === "unchanged" ? "confirmed" : "modified",
            });
        } catch (error) {
            log.warn("[lab] could not record what changed", error);
        }
        this.render();
    }
}

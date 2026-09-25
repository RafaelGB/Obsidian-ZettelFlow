import { Component } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { questionQuery, runGraphQuery } from "architecture/knowledge/state";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import {
    blindView,
    isMovement,
    MOVEMENTS,
    MOVEMENT_LABEL_KEY,
    type BlindState,
} from "application/thinking/blindReveal";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Think first, then look — now where you ask (#576, epic #574; the mechanic is #470's).
 *
 * It used to be the `eye-off` button in the Lab's header, and the person who specified it could not
 * find it in their own vault. That was the whole of its discoverability, and no amount of good copy
 * survives a door nobody opens.
 *
 * Moving it deleted something, which is the part that justifies the move: the panel carried its own
 * matching — a walk asking whether an idea's title contained any word of the question — beside a
 * query engine that has shipped `about:<term>` since #318. Now the question becomes a query
 * (`questionQuery`) and **Explore answers it**. What you knew is not a list this draws; it is the
 * surface doing its own job, one region below.
 *
 * The leak this must not have is structural, not disciplinary: `blindView` does not return what the
 * vault holds until you have answered, and the renderer hosting this one refuses to run its query
 * while the gate is unanswered. Two independent reasons nothing can appear early.
 */
export class BlindGate extends Component {
    private state: BlindState = { question: "" };
    private answerDraft = "";

    constructor(
        private readonly host: HTMLElement,
        /** Told the query to run once you have committed your own answer. Never called before. */
        private readonly onRevealed: (query: string) => void,
        /** Told when you clear it, so the surface can go back to showing everything. */
        private readonly onReset: () => void
    ) {
        super();
    }

    onload(): void {
        this.render();
    }

    /** Whether the surface is still waiting for your answer — the renderer's gate. */
    get waiting(): boolean {
        return blindView(this.state).stage === "asking";
    }

    private render(): void {
        const view = blindView(this.state);
        this.host.empty();
        this.host.addClass(c("blind"));
        this.host.createDiv({ cls: c("blind-intro"), text: t("blind_intro") });

        const question = this.host.createEl("input", {
            type: "text",
            cls: c("blind-question"),
            attr: { placeholder: t("blind_question_placeholder"), "aria-label": t("blind_title") },
        });
        question.value = this.state.question;
        this.registerDomEvent(question, "input", () => (this.state.question = question.value));

        if (view.stage === "asking") {
            this.renderAsking();
            return;
        }
        this.renderRevealed(view.thought ?? "", view.knewNothing);
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

    private renderRevealed(thought: string, knewNothing: boolean): void {
        const mine = this.host.createDiv({ cls: c("blind-column") });
        mine.createEl("h5", { text: t("blind_you_thought") });
        mine.createDiv({ cls: c("blind-answer-text"), text: thought });

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
            this.onReset();
        });

        // The heading for what the surface is about to show, one region below. An empty vault is a
        // real answer and often the interesting one, so it is said rather than left blank.
        this.host.createEl("h5", { cls: c("blind-knew"), text: t("blind_you_knew") });
        if (knewNothing) this.host.createDiv({ cls: c("blind-nothing"), text: t("blind_knew_nothing") });
    }

    /** Store the answer first, then look. The order is the feature. */
    private async reveal(): Promise<void> {
        const answer = this.answerDraft.trim();
        if (!answer || !this.state.question.trim()) return;

        // Kept as a thought, before anything is revealed — so what you thought survives even if you
        // close the surface the moment you see what you knew.
        await ThoughtStore.getInstance().write(`${this.state.question}\n\n${answer}`);

        const query = questionQuery(this.state.question);
        this.state = { ...this.state, answer, revealed: this.look(query) };
        this.render();
        this.onRevealed(query);
    }

    /**
     * Only to know whether the vault held anything — the list itself is Explore's to draw. The
     * engine is the one that already exists; there is no second query here and there must not be.
     */
    private look(query: string): { path: string; title: string }[] {
        if (query === "") return [];
        try {
            const model = KnowledgeIndex.getInstance().getModel();
            return runGraphQuery(model, query).matches.map((idea) => ({ path: idea.path, title: idea.title }));
        } catch (error) {
            log.warn("[explore] could not look at what you knew", error);
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
            log.warn("[explore] could not record what changed", error);
        }
        this.render();
    }
}

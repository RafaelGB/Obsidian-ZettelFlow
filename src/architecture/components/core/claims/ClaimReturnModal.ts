import { App, Modal, Notice, TFile } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { ConceptualTimeline } from "architecture/plugin";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { declaredSourcesOf, statedClaims, statedWager } from "architecture/plugin/claims/statedClaim";
import { answerReturn, observeWager } from "architecture/plugin/claims/answerReturn";
// The Experience layer reaches the model through the State surface, never a deep analysis (#266).
import type { JudgementOrigin } from "architecture/knowledge/state";
import {
    CLAIM_EDIT_INDEX,
    RETURN_ANSWERS,
    RETURN_ANSWER_LABEL_KEY,
    claimReturnView,
    clearDraft,
    keepDraft,
    readDraft,
    type ClaimReturnState,
    type ClaimReturnView,
    type ReturnAnswer,
} from "application/claims";

/**
 * The return (#562, epic #558).
 *
 * The question first, the vault shut. You write what you think today, and only then does it show
 * you what you wrote in June — because reading it first would take your own answer away, and
 * agreeing with yourself teaches nobody anything.
 *
 * The promise is kept by {@link claimReturnView}, not by this file: the stored sentence is not in
 * the view model until an answer exists, so there is nothing here to leak by accident. This draws
 * what it is given.
 */
export class ClaimReturnModal extends Modal {
    private session: ClaimReturnState;
    private busy = false;

    constructor(
        app: App,
        private readonly file: TFile,
        private readonly origin: JudgementOrigin = "human"
    ) {
        super(app);
        const claims = statedClaims(file);
        const wager = statedWager(file);
        this.session = {
            path: file.path,
            stored: claims[CLAIM_EDIT_INDEX] ?? "",
            claimIndex: CLAIM_EDIT_INDEX,
            claimCount: claims.length,
            historyKept: ConceptualTimeline.getInstance().enabled(),
            draft: readDraft(file.path),
            cites: declaredSourcesOf(file),
            // A wager only resolves once its day has come; before that this is an ordinary return
            // about the claim, and the prediction is nobody's business yet (#571).
            ...(wager && wager.at <= Date.now() ? { wager } : {}),
        };
    }

    onOpen(): void {
        this.render();
    }

    onClose(): void {
        // Leaving costs nothing: the draft is held outside the DOM, and nothing is recorded.
        this.contentEl.empty();
    }

    private render(): void {
        const view = claimReturnView(this.session);
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: t("claim_return_title") });
        contentEl.createDiv({ cls: c("claim-return-note"), text: this.file.basename });

        if (view.oneOfSeveral) {
            contentEl.createDiv({ cls: c("claim-door-hint"), text: t("claim_return_one_of_several") });
        }

        // What it cites, while you are being asked (#582) — and it is not asked for again here.
        if (view.cites.length > 0) {
            contentEl.createDiv({
                cls: c("claim-return-cites"),
                text: t("claim_return_cites", view.cites.join(", ")),
            });
        }

        // Resolving a wager has its own first stage — what happened — and the prediction is not
        // in the view model until it is written (#571).
        if (view.asksObservation) {
            this.renderObservation(contentEl);
            return;
        }
        if (this.session.wager) {
            this.renderWagerReveal(contentEl, view);
            return;
        }

        if (!view.answered) {
            this.renderQuestion(contentEl, view.draft);
            return;
        }
        this.renderReveal(contentEl, view.said ?? "", view.says ?? "", view.historyKept);
    }

    /** A wager's first stage: what actually happened, with what you predicted nowhere on screen. */
    private renderObservation(contentEl: HTMLElement): void {
        if (!ThoughtStore.getInstance().folder()) {
            // The observation is a thought, and a wager that resolves with nowhere to put the
            // answer is an invitation the product cannot honour (#562's precedent).
            contentEl.createDiv({ cls: c("claim-door-hint"), text: t("claim_return_wager_no_lab") });
            return;
        }
        contentEl.createDiv({ cls: c("claim-return-intro"), text: t("claim_return_wager_intro") });
        const box = contentEl.createEl("textarea", { cls: c("claim-return-answer") });
        box.placeholder = t("claim_return_wager_placeholder");
        box.setAttribute("aria-label", t("claim_return_wager_placeholder"));
        box.focus();

        const reveal = contentEl.createEl("button", { text: t("claim_return_wager_reveal"), cls: "mod-cta" });
        reveal.addEventListener("click", () => {
            void this.observe(box.value);
        });
    }

    /**
     * Write what happened, then show what was expected.
     *
     * In that order, and the order is the whole point: the sentence survives first — the #562
     * ordering — and the expectation reaches the view model only once it has.
     */
    private async observe(text: string): Promise<void> {
        const observation = text.trim();
        if (!observation || this.busy) return;
        this.busy = true;
        try {
            if (!(await observeWager(this.session.path, observation))) {
                new Notice(t("claim_door_failed"));
                return;
            }
            this.session = { ...this.session, observation };
            this.render();
        } finally {
            this.busy = false;
        }
    }

    /**
     * A wager's second stage: what you expected, what happened, and the claim's three answers.
     *
     * Nothing compares the two sentences. There is no tick, no cross, no word about which one you
     * wrote — nobody needs to be told.
     */
    private renderWagerReveal(contentEl: HTMLElement, view: ClaimReturnView): void {
        const pair = contentEl.createDiv({ cls: [c("claim-return-pair"), c("claim-revealed")].join(" ") });
        const expected = pair.createDiv({ cls: c("claim-return-side") });
        expected.createDiv({ cls: c("claim-return-label"), text: t("claim_return_expected") });
        expected.createDiv({ cls: c("claim-return-sentence"), text: view.expected ?? "" });
        const happened = pair.createDiv({ cls: c("claim-return-side") });
        happened.createDiv({ cls: c("claim-return-label"), text: t("claim_return_happened") });
        happened.createDiv({ cls: c("claim-return-sentence"), text: view.happened ?? "" });

        const claim = contentEl.createDiv({ cls: c("claim-return-side") });
        claim.createDiv({ cls: c("claim-return-label"), text: t("claim_return_wager_claim") });
        claim.createDiv({ cls: c("claim-return-sentence"), text: this.session.stored });

        // The new sentence, for *it says this now* — because here the text you typed is an
        // observation, and committing it would write what happened into the note's claim.
        const sentence = contentEl.createEl("input", { type: "text", cls: c("claim-door-input") });
        sentence.placeholder = t("claim_return_wager_new_sentence");
        sentence.setAttribute("aria-label", t("claim_return_wager_new_sentence"));

        this.renderAnswers(contentEl, () => (view.needsSentence ? sentence.value : this.session.answer ?? ""));
    }

    /** Stage one: your answer, and nothing else on screen. */
    private renderQuestion(contentEl: HTMLElement, draft: string): void {
        contentEl.createDiv({ cls: c("claim-return-intro"), text: t("claim_return_intro") });
        const box = contentEl.createEl("textarea", { cls: c("claim-return-answer") });
        box.value = draft;
        box.placeholder = t("claim_return_placeholder");
        box.setAttribute("aria-label", t("claim_return_placeholder"));
        box.focus();
        box.addEventListener("input", () => keepDraft(this.session.path, box.value));

        const reveal = contentEl.createEl("button", { text: t("claim_return_reveal"), cls: "mod-cta" });
        reveal.addEventListener("click", () => {
            const answer = box.value.trim();
            if (answer.length === 0) return;
            this.session = { ...this.session, answer, draft: box.value };
            this.render();
        });
    }

    /** Stage two: both sentences, neither of them marked as the better one. */
    private renderReveal(contentEl: HTMLElement, said: string, says: string, historyKept: boolean): void {
        // The moment, and the only one: the two sentences meeting. A short fade, nothing else,
        // and nothing at all when the reader has asked for less motion (#565).
        const pair = contentEl.createDiv({ cls: [c("claim-return-pair"), c("claim-revealed")].join(" ") });
        const before = pair.createDiv({ cls: c("claim-return-side") });
        before.createDiv({ cls: c("claim-return-label"), text: t("claim_return_then") });
        before.createDiv({ cls: c("claim-return-sentence"), text: said });
        const after = pair.createDiv({ cls: c("claim-return-side") });
        after.createDiv({ cls: c("claim-return-label"), text: t("claim_return_now") });
        after.createDiv({ cls: c("claim-return-sentence"), text: says });

        if (!historyKept) {
            // Said once, where it is relevant, and never again.
            contentEl.createDiv({ cls: c("claim-door-hint"), text: t("claim_return_history_off") });
        }

        const canWithdraw = ThoughtStore.getInstance().folder().length > 0;
        if (!canWithdraw) {
            contentEl.createDiv({ cls: c("claim-door-hint"), text: t("claim_return_no_lab") });
        }

        this.renderAnswers(contentEl, () => says);
    }

    /**
     * The three answers, wherever they are asked from.
     *
     * `sentenceOf` is a callback rather than a value because a wager reads the new sentence out of
     * its own box at the moment you choose — the text you typed in the first stage was an
     * observation, not a claim.
     */
    private renderAnswers(contentEl: HTMLElement, sentenceOf: () => string): void {
        const canWithdraw = ThoughtStore.getInstance().folder().length > 0;
        const row = contentEl.createDiv({ cls: c("claim-return-answers") });
        const buttons: HTMLButtonElement[] = [];
        for (const answer of RETURN_ANSWERS) {
            if (answer === "rejected" && !canWithdraw) continue;
            const button = row.createEl("button", {
                text: t(RETURN_ANSWER_LABEL_KEY[answer] as Parameters<typeof t>[0]),
                cls: answer === "confirmed" ? "mod-cta" : c("claim-return-answer-button"),
            });
            buttons.push(button);
            button.addEventListener("click", () => void this.commit(answer, sentenceOf(), buttons));
        }
    }

    private async commit(answer: ReturnAnswer, sentence: string, buttons: HTMLButtonElement[]): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        for (const button of buttons) button.disabled = true;
        try {
            const done = await answerReturn({
                path: this.session.path,
                stored: this.session.stored,
                claimIndex: this.session.claimIndex,
                origin: this.origin,
                answer,
                sentence,
                // Resolving a wager takes its horizon off in the same write — otherwise it would
                // come due again for ever (#571).
                ...(this.session.wager ? { clearHorizon: true } : {}),
            });
            if (!done) {
                new Notice(t("claim_door_failed"));
                return;
            }
            clearDraft(this.session.path);
            this.contentEl.addClass(c("claim-saved"));
            if (answer === "rejected") new Notice(t("claim_return_withdrawn"));
            this.close();
        } finally {
            this.busy = false;
            for (const button of buttons) button.disabled = false;
        }
    }
}

import { App, Modal, Setting } from "obsidian";
import { t } from "architecture/lang";
import { c } from "architecture";

/** What the user decided about a proposal. `null` (dismissal) is deliberately not a verdict. */
export interface ProposalOutcome {
    verdict: "accepted" | "modified" | "rejected";
    /** The text to write. Empty for a rejection. */
    text: string;
}

/**
 * The **proposal modal** (#337, epic #335) — the single place machine-written text asks to be
 * committed. [Constitution §XII](../../../../docs/development/constitution.md): interpretive output is
 * *proposed*, never *committed*, so every AI completion passes through here before it can reach a note.
 *
 * The proposal is editable, because "modify" is a first-class verdict: the interesting case is not
 * accept-or-discard but *the user making it theirs*. Accepting unchanged text records `accepted`;
 * accepting after an edit records `modified` — so the button says what will actually happen.
 *
 * Dismissing (Esc / clicking away) writes nothing **and records nothing**: a dismissal is not a
 * judgement, the same rule #338 applies to a skipped friction prompt.
 */
export class ProposalModal extends Modal {
    private readonly proposed: string;
    private current: string;
    private outcome: ProposalOutcome | null = null;
    private resolve: ((outcome: ProposalOutcome | null) => void) | null = null;
    private acceptLabel: HTMLElement | null = null;

    constructor(app: App, private readonly title: string, proposed: string) {
        super(app);
        this.proposed = proposed;
        this.current = proposed;
    }

    /** Open the modal and resolve with the user's verdict, or `null` if they dismissed it. */
    public ask(): Promise<ProposalOutcome | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        this.modalEl.addClass(c("proposal-modal"));
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: this.title });
        contentEl.createEl("p", { text: t("proposal_intro"), cls: c("proposal-intro") });

        const textarea = contentEl.createEl("textarea", {
            cls: c("proposal-text"),
            attr: { rows: "10", "aria-label": t("proposal_text_label") },
        });
        textarea.value = this.proposed;
        textarea.addEventListener("input", () => {
            this.current = textarea.value;
            this.refreshAcceptLabel();
        });

        new Setting(contentEl)
            .addButton((btn) => {
                btn.setCta()
                    .setButtonText(this.acceptText())
                    .onClick(() => this.finish({ verdict: this.edited() ? "modified" : "accepted", text: this.current }));
                this.acceptLabel = btn.buttonEl;
            })
            .addButton((btn) =>
                btn
                    // Not destructive: rejecting discards a proposal, it never removes your work.
                    .setButtonText(t("proposal_reject"))
                    .onClick(() => this.finish({ verdict: "rejected", text: "" }))
            );

        contentEl.createEl("p", { text: t("proposal_recorded_hint"), cls: c("proposal-hint") });
        window.setTimeout(() => textarea.focus(), 0);
    }

    onClose(): void {
        this.contentEl.empty();
        // Resolves `null` on a dismissal, because `outcome` is only set by an explicit verdict.
        this.resolve?.(this.outcome);
        this.resolve = null;
    }

    private edited(): boolean {
        return this.current.trim() !== this.proposed.trim();
    }

    /** The accept button says what it will do: commit the model's text, or commit yours. */
    private acceptText(): string {
        return this.edited() ? t("proposal_save_edit") : t("proposal_accept");
    }

    private refreshAcceptLabel(): void {
        if (this.acceptLabel) this.acceptLabel.setText(this.acceptText());
    }

    private finish(outcome: ProposalOutcome): void {
        this.outcome = outcome;
        this.close();
    }
}

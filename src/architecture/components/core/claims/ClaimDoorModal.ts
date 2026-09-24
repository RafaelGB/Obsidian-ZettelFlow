import { App, Modal, Notice, TFile } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { declaredSourcesOf, stateClaim, statedClaims, statedWager } from "architecture/plugin/claims/statedClaim";
// Through the top barrel: a view reaches the model there or at the State surface, never deeper (#266).
import { toDateInput } from "architecture/knowledge";
import { SourceNoteSuggest } from "./SourceNoteSuggest";

/**
 * The sentence box (#561, epic #558).
 *
 * One question, one line, and the current claim already in it. No kind picker, no source field, no
 * confidence, no tags — the Lab's rule, that a gesture which opens a form is a gesture nobody
 * repeats, applied to the one form this product actually needs.
 *
 * Shaped after `QuickCaptureModal`: `Enter` submits, the button submits, a `busy` guard stops a
 * double commit, and an empty box closes having written nothing.
 */
export class ClaimDoorModal extends Modal {
    private busy = false;

    constructor(
        app: App,
        private readonly file: TFile,
        private readonly save: (
            path: string,
            sentence: string,
            source?: string,
            wager?: { expectation: string; by: string }
        ) => Promise<boolean> = stateClaim
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: t("claim_door_title") });

        const existing = statedClaims(this.file);
        const input = contentEl.createEl("input", { type: "text", cls: c("claim-door-input") });
        input.value = existing[0] ?? "";
        input.placeholder = t("claim_door_placeholder");
        input.setAttribute("aria-label", t("claim_door_placeholder"));
        input.focus();
        input.select();

        // Said only when it is true, and said as a fact: this note says more than one thing, and
        // you are editing the first of them.
        if (existing.length > 1) {
            contentEl.createDiv({ cls: c("claim-door-hint"), text: t("claim_door_other_claims") });
        }

        // And where it came from (#582) — **optional**, and the normal path is to skip it. A claim
        // with no source is `unsourced` by definition, which is why the line belongs here rather
        // than in YAML; it is not a requirement, and nothing here says it is missing.
        const source = contentEl.createEl("input", { type: "text", cls: c("claim-door-source") });
        source.value = declaredSourcesOf(this.file)[0] ?? "";
        source.placeholder = t("claim_door_source_placeholder");
        source.setAttribute("aria-label", t("claim_door_source_placeholder"));
        new SourceNoteSuggest(source);

        // And what you expect to see, by when (#570) — two more optional lines, and the normal path
        // is to skip them. Most claims are not wagers, and a form that insists is a form nobody uses
        // twice. What they add is the one thing nothing else in this product has: something you can
        // be **wrong** about.
        const wager = statedWager(this.file);
        const expectation = contentEl.createEl("input", { type: "text", cls: c("claim-door-expect") });
        expectation.value = wager?.expectation ?? "";
        expectation.placeholder = t("claim_door_expect_placeholder");
        expectation.setAttribute("aria-label", t("claim_door_expect_placeholder"));

        const by = contentEl.createEl("input", { type: "date", cls: c("claim-door-by") });
        by.value = wager ? toDateInput(wager.at) : "";
        by.setAttribute("aria-label", t("claim_door_by_label"));

        const submit = async (): Promise<void> => {
            const sentence = input.value.trim();
            if (!sentence || this.busy) return;
            this.busy = true;
            button.disabled = true;
            try {
                const written = await this.save(
                    this.file.path,
                    sentence,
                    source.value.trim() || undefined,
                    { expectation: expectation.value, by: by.value }
                );
                new Notice(written ? t("claim_door_saved") : t("claim_door_failed"));
                if (written) this.close();
            } finally {
                this.busy = false;
                button.disabled = false;
            }
        };

        for (const box of [input, source, expectation, by]) {
            box.addEventListener("keydown", (event) => {
                if (event.key === "Enter") void submit();
            });
        }
        const button = contentEl.createEl("button", { text: t("claim_door_button"), cls: "mod-cta" });
        button.addEventListener("click", () => void submit());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

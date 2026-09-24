import { App, Modal, Notice, TFile } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { declaredSourcesOf, stateClaim, statedClaims } from "architecture/plugin/claims/statedClaim";
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
        private readonly save: (path: string, sentence: string, source?: string) => Promise<boolean> = stateClaim
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

        const submit = async (): Promise<void> => {
            const sentence = input.value.trim();
            if (!sentence || this.busy) return;
            this.busy = true;
            button.disabled = true;
            try {
                const written = await this.save(this.file.path, sentence, source.value.trim() || undefined);
                new Notice(written ? t("claim_door_saved") : t("claim_door_failed"));
                if (written) this.close();
            } finally {
                this.busy = false;
                button.disabled = false;
            }
        };

        for (const box of [input, source]) {
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

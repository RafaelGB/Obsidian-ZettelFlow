import { App, Modal, Notice, Setting } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { crystallize } from "architecture/plugin/thinking/crystallizeThought";
import type { Crystallization } from "application/thinking/crystallize";

/**
 * The note, before it exists (#468, epic #465).
 *
 * The title and the text are **proposed, never imposed**: a proposal that is hard to change is an
 * imposition, and this is the one moment where what you meant has to survive intact. Cancelling
 * writes nothing at all.
 *
 * Underneath, what it will remember — the thoughts it came from, quoted and frozen, so the record
 * survives the Lab being emptied.
 */
export class CrystallizeModal extends Modal {
    private title: string;
    private body: string;

    constructor(
        app: App,
        private readonly plan: Crystallization,
        private readonly onDone: () => void
    ) {
        super(app);
        this.title = plan.title;
        this.body = plan.body;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass(c("crystallize"));
        contentEl.createEl("h2", { text: t("crystallize_title") });
        contentEl.createDiv({ cls: c("crystallize-intro"), text: t("crystallize_intro") });

        new Setting(contentEl).setName(t("crystallize_note_title")).addText((text) =>
            text.setValue(this.title).onChange((value) => (this.title = value))
        );

        const body = contentEl.createEl("textarea", { cls: c("crystallize-body"), attr: { rows: "10" } });
        body.value = this.body;
        body.addEventListener("input", () => (this.body = body.value));

        // What it will remember. Shown before you agree to it, because provenance you did not see
        // is provenance you did not choose.
        contentEl.createEl("h3", { text: t("crystallize_born_from") });
        const list = contentEl.createEl("ul", { cls: c("crystallize-origins") });
        for (const origin of this.plan.frozen) list.createEl("li", { text: origin.quote });
        if (this.plan.omitted > 0) {
            list.createEl("li", { text: t("crystallize_and_more", String(this.plan.omitted)) });
        }
        contentEl.createDiv({ cls: c("crystallize-keeps"), text: t("crystallize_keeps_thoughts") });

        new Setting(contentEl)
            .addButton((button) =>
                button
                    .setButtonText(t("crystallize_confirm"))
                    .setCta()
                    .onClick(() => void this.apply())
            )
            .addButton((button) => button.setButtonText(t("crystallize_cancel")).onClick(() => this.close()));
    }

    private async apply(): Promise<void> {
        this.close();
        try {
            const path = await crystallize({
                plan: this.plan,
                title: this.title,
                body: this.body,
                folder: "",
            });
            new Notice(path ? t("crystallize_done", path) : t("crystallize_failed"));
            this.onDone();
        } catch (error) {
            log.error("[lab] crystallization failed", error);
            new Notice(t("crystallize_failed"));
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

import { App, Modal, Notice, Setting } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { crystallize, crystallizeInto } from "architecture/plugin/thinking/crystallizeThought";
import { destinationsFor, type Crystallization, type Destination } from "application/thinking/crystallize";

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

    /** Where it lands. `back` only exists when the thread had a subject that still does. */
    private destination: Destination;

    constructor(
        app: App,
        private readonly plan: Crystallization,
        /** Given the path it wrote, so the caller can record what the thinking became (#492). */
        private readonly onDone: (path?: string) => void,
        /** The note the thread was about, when it had one (#474). */
        private readonly subject?: string
    ) {
        super(app);
        this.title = plan.title;
        this.body = plan.body;
        // No default when both are open: where a piece of thinking belongs is the decision, and
        // guessing it is how it ends up in the wrong place.
        this.destination = this.choices()[0];
    }

    private choices(): Destination[] {
        const exists = Boolean(this.subject && this.app.vault.getAbstractFileByPath(this.subject));
        // A note in an excluded folder is outside ZettelFlow (#688): it is never written back into.
        return destinationsFor(this.subject, exists && !this.subjectOutside());
    }

    /** Whether the thread's note sits in an excluded folder. */
    private subjectOutside(): boolean {
        return Boolean(this.subject && !KnowledgeIndex.getInstance().inScope(this.subject));
    }

    onOpen(): void {
        const { contentEl } = this;
        // Re-entered when the destination changes, so it clears first: an Obsidian modal keeps
        // its element, and the settings-panel lesson (#434) applies here too.
        contentEl.empty();
        contentEl.addClass(c("crystallize"));
        contentEl.createEl("h2", { text: t("crystallize_title") });
        contentEl.createDiv({ cls: c("crystallize-intro"), text: t("crystallize_intro") });

        const choices = this.choices();
        if (choices.length > 1 && this.subject) {
            const name = (this.subject.split("/").pop() ?? this.subject).replace(/\.md$/, "");
            new Setting(contentEl).setName(t("crystallize_where")).addDropdown((dropdown) => {
                dropdown.addOption("back", t("crystallize_where_back", name));
                dropdown.addOption("new-note", t("crystallize_where_new"));
                dropdown.setValue(this.destination).onChange((value) => {
                    this.destination = value as Destination;
                    this.onOpen();
                });
            });
        } else if (this.subject) {
            // Offering to append to something that is gone is offering to fail; offering to append
            // to a note outside ZettelFlow is offering a write it promised not to make (#688).
            const text = this.subjectOutside() ? t("crystallize_subject_outside") : t("crystallize_subject_gone");
            contentEl.createDiv({ cls: c("crystallize-keeps"), text });
        }

        if (this.destination === "new-note") {
            new Setting(contentEl).setName(t("crystallize_note_title")).addText((text) =>
                text.setValue(this.title).onChange((value) => (this.title = value))
            );
        }

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

        // "Create the note" is a lie when the thinking is going back into the note it came from —
        // that is an update, and the button has to say so (#590 follow-up).
        const confirm = this.destination === "back" ? "crystallize_confirm_back" : "crystallize_confirm";
        new Setting(contentEl)
            .addButton((button) =>
                button
                    .setButtonText(t(confirm))
                    .setCta()
                    .onClick(() => void this.apply())
            )
            .addButton((button) => button.setButtonText(t("crystallize_cancel")).onClick(() => this.close()));
    }

    private async apply(): Promise<void> {
        this.close();
        const appending = this.destination === "back" && Boolean(this.subject);
        try {
            const path =
                appending && this.subject
                    ? await crystallizeInto(this.subject, this.plan, this.body)
                    : await crystallize({
                          plan: this.plan,
                          title: this.title,
                          body: this.body,
                          folder: "",
                      });
            new Notice(path ? t(appending ? "crystallize_done_back" : "crystallize_done", path) : t("crystallize_failed"));
            this.onDone(path);
        } catch (error) {
            log.error("[lab] crystallization failed", error);
            new Notice(t("crystallize_failed"));
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

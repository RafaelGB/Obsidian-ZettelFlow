import { App, Modal, Notice, Setting } from "obsidian";
import { t } from "architecture/lang";
import { c } from "architecture";
import type { StepExit } from "application/notes/stepExits";
import { ConditionEditorModal } from "./ConditionEditorModal";

/**
 * One **exit** of a step, as a form (#427, epic #422).
 *
 * An arrow used to be configured by writing `if: frontmatter.state === "permanent"` into its label,
 * which put code on the diagram and printed it at the person writing a note. Here the same arrow
 * answers three plain questions — what it says, when it is open, whether you land on it — and the
 * condition still opens the guided editor (#258) rather than asking anyone to type JavaScript.
 *
 * The modal owns no storage: the caller passes the current exit and receives the edited one, so the
 * same form serves the arrow's popup (writes to the step) and the step editor (edits in place).
 */
export class ExitEditorModal extends Modal {
    private exit: StepExit;

    constructor(
        app: App,
        private destination: string,
        initial: StepExit,
        private onSave: (exit: StepExit) => void | Promise<void>
    ) {
        super(app);
        this.exit = { ...initial };
    }

    onOpen(): void {
        this.setTitle(t("exit_editor_title"));
        const { contentEl } = this;

        contentEl.createDiv({ cls: c("exit-editor-destination") }, (el) => {
            el.createSpan({ text: t("exit_editor_destination") });
            el.createSpan({ cls: c("exit-editor-destination-name"), text: this.destination });
        });

        new Setting(contentEl)
            .setName(t("exit_editor_says"))
            .setDesc(t("exit_editor_says_description"))
            .addText((text) =>
                text
                    .setPlaceholder(this.destination)
                    .setValue(this.exit.says ?? "")
                    .onChange((value) => {
                        const says = value.trim();
                        if (says) {
                            this.exit.says = says;
                        } else {
                            delete this.exit.says;
                        }
                    })
            );

        const when = new Setting(contentEl)
            .setName(t("exit_editor_when"))
            .setDesc(t("exit_editor_when_description"));
        const state = when.controlEl.createSpan({ cls: c("exit-editor-when") });
        const paint = () => {
            state.textContent = this.exit.when?.trim() || t("step_exits_when_always");
        };
        paint();
        when.addButton((button) =>
            button.setButtonText(t("step_exits_when_edit")).onClick(() => {
                new ConditionEditorModal(this.app, this.exit.when ?? "", (expression) => {
                    if (expression) {
                        this.exit.when = expression;
                    } else {
                        // An empty expression is the honest way to reopen a branch for good.
                        delete this.exit.when;
                    }
                    paint();
                }).open();
            })
        );

        new Setting(contentEl)
            .setName(t("exit_editor_default"))
            .setDesc(t("exit_editor_default_description"))
            .addToggle((toggle) =>
                toggle.setValue(this.exit.default === true).onChange((value) => {
                    if (value) {
                        this.exit.default = true;
                    } else {
                        delete this.exit.default;
                    }
                })
            );

        new Setting(contentEl)
            .addButton((button) =>
                button
                    .setButtonText(t("exit_editor_save"))
                    .setCta()
                    .onClick(() => {
                        void (async () => {
                            await this.onSave(this.exit);
                            this.close();
                        })();
                    })
            )
            .addButton((button) =>
                button.setButtonText(t("exit_editor_cancel")).onClick(() => this.close())
            );
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/** The step could not take the exit (a script node, an unreadable canvas): say so, save nothing. */
export function noticeExitSaveFailed(): void {
    new Notice(t("exit_editor_save_failed"));
}

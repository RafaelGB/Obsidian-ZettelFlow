import { c } from "architecture";
import { App, Modal, Setting } from "obsidian";

export interface Option {
    label: string;
    onSelect: () => Promise<void>;
}

export class OptionsModal extends Modal {
    private question: string;
    private options: Option[];

    /**
     * @param app - Obsidian application instance.
     * @param question - Question to display.
     * @param options - Array of options to display.
     */
    constructor(app: App, question: string, options: Option[]) {
        super(app);
        this.question = question;
        this.options = options;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass(c("options-modal"));

        // Modal title
        const titleEl = contentEl.createEl("h2", { text: this.question });
        titleEl.addClass(c("options-modal-title"));

        // Container for options
        const optionsContainer = contentEl.createDiv({ cls: c("options-modal-container") });

        // Create a button for each option
        this.options.forEach(option => {
            const optionDiv = optionsContainer.createDiv();
            new Setting(optionDiv)
                .addButton(btn => {
                    btn.setButtonText(option.label)
                        .onClick(async () => {
                            await option.onSelect();
                            this.close();
                        });
                    // Add custom class to the button
                    btn.buttonEl.addClass(c("options-modal-button"));
                });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
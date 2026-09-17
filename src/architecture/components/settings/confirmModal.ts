import { App, Modal, Setting } from "obsidian";
import { c } from "architecture";

/**
 * INTERFACE ADAPTER: This modal acts as the user interface adapter for a simple confirmation dialog.
 * It receives the domain logic callback (onAccept) as a dependency from outside, ensuring separation of concerns.
 */
export class ConfirmModal extends Modal {
    // The question/message to display
    private question: string;

    // The text for the accept button
    private acceptButtonText: string;

    // The text for the cancel button
    private cancelButtonText: string;

    // Callback to be invoked when the user accepts
    private onAcceptCallback: () => Promise<void>;

    /** What the confirmation is about to do, line by line (#428 FR-7). Optional. */
    private details: string[];

    /**
     * APPLICATION SERVICE: The constructor receives all necessary data to fulfill the modal's purpose:
     * - question: string to display
     * - acceptButtonText: label for the accept button
     * - cancelButtonText: label for the cancel button
     * - onAcceptCallback: function to be called when the user confirms
     */
    constructor(
        app: App,
        question: string,
        acceptButtonText: string,
        cancelButtonText: string,
        onAcceptCallback: () => Promise<void>,
        details: string[] = []
    ) {
        super(app);
        this.question = question;
        this.acceptButtonText = acceptButtonText;
        this.cancelButtonText = cancelButtonText;
        this.onAcceptCallback = onAcceptCallback;
        this.details = details;
    }

    /**
     * UI RENDERING: This method is automatically called by Obsidian when the modal opens.
     * We use it to build and display the user interface elements.
     */
    onOpen() {

        // Create the question text
        this.contentEl.createEl("h2", { text: this.question });

        // What is about to change, when the caller knows (#428 FR-7): an overwrite nobody can see
        // is an overwrite nobody agreed to.
        if (this.details.length > 0) {
            const list = this.contentEl.createEl("ul", { cls: c("confirm-details") });
            for (const detail of this.details) list.createEl("li", { text: detail });
        }

        // Create a container for buttons using a Setting
        new Setting(this.contentEl)
            .addButton((btn) => {
                btn.setButtonText(this.acceptButtonText)
                    .setCta() // makes the button stand out
                    .onClick(() => {
                        // Invoke the callback if user accepts
                        void this.onAcceptCallback();
                        this.close();
                    });
            })
            .addButton((btn) => {
                btn.setButtonText(this.cancelButtonText).onClick(() => {
                    // Close modal if user cancels
                    this.close();
                });
            });
    }

    /**
     * CLEANUP: Called automatically when the modal closes.
     * We can handle any cleanup logic here.
     */
    onClose() {
        this.contentEl.empty();
    }
}

import { App, Modal, Setting } from "obsidian";

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
    private onAcceptCallback: () => void;

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
        onAcceptCallback: () => Promise<void>
    ) {
        super(app);
        this.question = question;
        this.acceptButtonText = acceptButtonText;
        this.cancelButtonText = cancelButtonText;
        this.onAcceptCallback = onAcceptCallback;
    }

    /**
     * UI RENDERING: This method is automatically called by Obsidian when the modal opens.
     * We use it to build and display the user interface elements.
     */
    onOpen() {
        const { contentEl } = this;

        // Create the question text
        contentEl.createEl("h2", { text: this.question });

        // Create a container for buttons using a Setting
        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText(this.acceptButtonText)
                    .setCta() // makes the button stand out
                    .onClick(() => {
                        // Invoke the callback if user accepts
                        this.onAcceptCallback();
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
        const { contentEl } = this;
        contentEl.empty();
    }
}

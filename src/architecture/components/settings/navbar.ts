import { c } from "architecture";
import { Action } from "architecture/api";
import { Notice, setIcon } from "obsidian";

export function navbarAction(contentEl: HTMLElement, name: string, description: string, action: Action): void {
    const span = activeDocument.createElement("span", {});
    // Header with title and subtitle with the mode
    const navbar = contentEl.createDiv({ cls: c("modal-navbar") });

    navbar.createEl("h2", { text: name })
    navbar.createEl("p", { text: description });
    // Separator
    navbar.appendChild(span);

    const navbarButtonGroup = navbar.createDiv({ cls: c("navbar-button-group") });
    // Add a button to save the step into the clipboard
    const useTemplateButton = navbarButtonGroup.createEl("button", {
        placeholder: "Copy Action", title: "Copy the action to the clipboard"
    }, el => {
        el.addClass("mod-cta");
        el.addEventListener("click", () => {
            // Save step to clipboard
            navigator.clipboard.writeText(JSON.stringify(action, null, 2))
            new Notice(`Action copied to clipboard`);
        });

    });
    setIcon(useTemplateButton.createDiv(), "clipboard-copy");
}
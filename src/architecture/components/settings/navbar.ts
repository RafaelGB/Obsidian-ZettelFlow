import { c } from "architecture";
import { Action } from "architecture/api";
import { CommunityAction } from "config";
import { Notice, setIcon } from "obsidian";
import { AbstractStepModal } from "zettelkasten/modals/AbstractStepModal";

export function navbarAction(contentEl: HTMLElement, name: string, description: string, action: Action, modal: AbstractStepModal): void {
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
        el.addEventListener("click", async () => {
            // Save step to clipboard
            const communityAction: CommunityAction = {
                ...action,
                template_type: "action",
                author: "You",
                title: "New action",
                description: action.description || "New action description"
            }
            navigator.clipboard.writeText(JSON.stringify(communityAction, null, 2))
            modal.getPlugin().settings.communitySettings.clipboardTemplate = communityAction;
            await modal.getPlugin().saveSettings();
            new Notice(`Action copied to clipboard`);
        });

    });
    setIcon(useTemplateButton.createDiv(), "clipboard-copy");
}
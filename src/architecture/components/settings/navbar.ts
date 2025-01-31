import { UsedInstalledActionsModal } from "application/community/UsedInstalledAActionsModal";
import { c } from "architecture";
import { Action } from "architecture/api";
import { CommunityAction } from "config";
import { Notice, setIcon } from "obsidian";
import { ActionBuilderMapper } from "zettelkasten";
import { AbstractStepModal } from "zettelkasten/modals/AbstractStepModal";
import { InstalledActionEditorModal } from "zettelkasten/modals/InstalledActionEditorModal";

export function navbarAction(
    contentEl: HTMLElement,
    name: string,
    description: string,
    action: Action,
    modal: AbstractStepModal,
    disableNavbar: boolean = false
): void {
    const span = activeDocument.createElement("span", {});
    // Header with title and subtitle with the mode
    const navbar = contentEl.createDiv({ cls: c("modal-navbar") });

    navbar.createEl("h2", { text: name })
    navbar.createEl("p", { text: description });
    // Separator
    navbar.appendChild(span);

    if (disableNavbar) return;

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

    // Add a button to apply a community template

    const applyTemplate = navbarButtonGroup.createEl("button", {
        placeholder: "Apply Action", title: "Apply the action to the current document"
    }, el => {
        el.addClass("mod-cta");
        el.addEventListener("click", async () => {
            // Apply the action to the current document
            new UsedInstalledActionsModal(modal.getPlugin(), (action) => {
                // obtain the action array position
                const index = modal.info.actions.findIndex((a) => a.id === action.id);
                // replace the action
                modal.info.actions[index] = action;
                // update the UI
                modal.refresh();
            }).open();
        });
    });
    setIcon(applyTemplate.createDiv(), "pen");

    // Add action as community template
    const newCommunityAction = navbarButtonGroup.createEl("button", {
        placeholder: "Add to Community", title: "Add the action to the community templates"
    }, el => {
        el.addClass("mod-cta");
        el.addEventListener("click", async () => {
            // Step 1 - save the action internally
            const newCommunityAction = ActionBuilderMapper.Action2CommunityActionSettings(action, {
                title: "New template",
                description: "New template description"
            });
            modal.getPlugin().settings.installedTemplates.actions[newCommunityAction.id] = newCommunityAction;
            modal.getPlugin().saveSettings();
            // Step 2 - Open the modal to edit the action
            new InstalledActionEditorModal(modal.getPlugin(), newCommunityAction).open();
        });
    });
    setIcon(newCommunityAction.createDiv(), "book-marked");
}
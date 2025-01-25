import { c, log } from "architecture";
import { actionsStore } from "architecture/api";
import { CommunityAction } from "config";
import ZettelFlow from "main";
import { Notice, setIcon, Setting } from "obsidian";
import { AbstractStepModal } from "./AbstractStepModal";
import { StepBuilderInfo } from "zettelkasten/typing";

export class InstalledActionEditorModal extends AbstractStepModal {
    info: StepBuilderInfo;

    constructor(
        private plugin: ZettelFlow,
        private communityAction: CommunityAction,
        private editCallback: (step: CommunityAction) => void = () => { }
    ) {
        super(plugin.app);
    }

    getPlugin(): ZettelFlow {
        return this.plugin;
    }
    mode: string;
    builder: string;
    refresh(): void {
        this.renderContent();
    }

    onOpen(): void {
        this.modalEl.addClass(c("modal"));
        this.renderContent();
    }

    private renderContent() {
        // Clear the previous content
        this.contentEl.empty();
        const span = activeDocument.createElement("span", {});
        this.modalEl.addClass(c("modal"));
        // Header with title and subtitle with the mode
        const navbar = this.info.contentEl.createDiv({ cls: c("modal-navbar") });

        navbar.createEl("h2", { text: "Installed Action Editor" })

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
                navigator.clipboard.writeText(JSON.stringify(this.communityAction, null, 2))
                new Notice(`Action copied to clipboard`);
            });

        });
        setIcon(useTemplateButton.createDiv(), "clipboard-copy")

        // Show author and download count (if available)
        const { author, downloads } = this.communityAction;
        const authorEl = this.contentEl.createDiv({ cls: c("modal-author") });
        authorEl.createEl("span", { text: `Author: ${author}` });
        if (downloads) {
            authorEl.createEl("span", { text: `Downloads: ${downloads}` });
        }

        // Header with title and subtitle with the mode
        const { title, description } = this.communityAction;
        new Setting(this.contentEl)
            .setName("Title")
            .setDesc("Title of the installed action")
            .addText((text) => text
                .setPlaceholder("Title")
                .setValue(title || '')
                .onChange((value: string) => {
                    this.communityAction.title = value;
                })
            );

        const descSetting = new Setting(this.contentEl)
            .setName("Description")
            .setDesc("Information about the installed action and its purpose")
            .addTextArea((text) => {
                text.inputEl.style.minWidth = "-webkit-fill-available";
                text.inputEl.rows = 4;
                text
                    .setPlaceholder("Description")
                    .setValue(description || '')
                    .onChange((value: string) => {
                        this.communityAction.description = value;
                    })
            }
            );
        descSetting.settingEl.style.display = 'block';

        const currentAction = actionsStore.getAction(this.communityAction.type);
        const detailsEl = this.contentEl.createDiv({ cls: c("modal-reader-general-section") });
        currentAction.settings(detailsEl, this, this.communityAction);
    }

    onClose(): void {
        log.debug("Closing InstalledActionEditorModal");
        this.saveActionToSettings().then(() => {
            log.info(`Action ${this.communityAction.id} saved to settings`);
        }).catch((error) => {
            log.error(error);
        });
    }

    private async saveActionToSettings(): Promise<void> {
        this.editCallback(this.communityAction);
        this.plugin.settings.installedTemplates.actions[this.communityAction.id] = this.communityAction;
        this.plugin.saveSettings();
    }
}
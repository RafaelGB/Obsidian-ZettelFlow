import { c, log } from "architecture";
import { actionsStore } from "architecture/api";
import { CommunityAction } from "config";
import ZettelFlow from "main";
import { Notice, setIcon, Setting } from "obsidian";
import { AbstractStepModal } from "./AbstractStepModal";
import { StepBuilderInfo } from "zettelkasten/typing";
import { ConfirmModal } from "architecture/components/settings";
import { t } from "architecture/lang";

export class InstalledActionEditorModal extends AbstractStepModal {
    info: StepBuilderInfo;
    private removed = false;
    constructor(
        private plugin: ZettelFlow,
        private communityAction: CommunityAction,
        private editCallback: (step: CommunityAction, removed: boolean) => void = () => { }
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
        const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });

        navbar.createEl("h2", { text: t("installed_action_editor_title") })

        // Separator
        navbar.appendChild(span);

        const navbarButtonGroup = navbar.createDiv({ cls: c("navbar-button-group") });
        // Add Uninstall button
        const uninstallButton = navbarButtonGroup.createEl("button", {
            placeholder: t("remove_button"),
            title: t("remove_action_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", async (e) => {
                e.stopPropagation();
                new ConfirmModal(
                    this.plugin.app,
                    t("confirm_remove_action"),
                    t("confirm_remove_button"),
                    t("confirm_cancel_button"),
                    async () => {
                        this.removed = true;
                        this.close();
                    }
                ).open();

            });
        });
        setIcon(uninstallButton.createDiv(), "trash-2")

        // Add a button to save the step into the clipboard
        const useTemplateButton = navbarButtonGroup.createEl("button", {
            placeholder: t("copy_action_button"),
            title: t("copy_action_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", () => {
                // Save step to clipboard
                navigator.clipboard.writeText(JSON.stringify(this.communityAction, null, 2))
                new Notice(t("action_copied_notice"));
            });

        });
        setIcon(useTemplateButton.createDiv(), "clipboard-copy")

        // Show author and download count (if available)
        const { author, downloads } = this.communityAction;
        const authorEl = this.contentEl.createDiv({ cls: c("modal-author") });
        authorEl.createEl("span", { text: `${t("template_author")}: ${author}` });
        if (downloads) {
            authorEl.createEl("span", { text: `${t("template_downloads")}: ${downloads}` });
        }

        // Header with title and subtitle with the mode
        const { title, description } = this.communityAction;
        new Setting(this.contentEl)
            .setName(t("action_title_label"))
            .setDesc(t("action_title_description"))
            .addText((text) => text
                .setPlaceholder(t("action_title_label"))
                .setValue(title || '')
                .onChange((value: string) => {
                    this.communityAction.title = value;
                })
            );

        const descSetting = new Setting(this.contentEl)
            .setName(t("action_description_label"))
            .setDesc(t("action_description_text"))
            .addTextArea((text) => {
                text.inputEl.style.minWidth = "-webkit-fill-available";
                text.inputEl.rows = 4;
                text
                    .setPlaceholder(t("action_description_label"))
                    .setValue(description || '')
                    .onChange((value: string) => {
                        this.communityAction.description = value;
                    })
            }
            );
        descSetting.settingEl.style.display = 'block';

        const currentAction = actionsStore.getAction(this.communityAction.type);
        const detailsEl = this.contentEl.createDiv({ cls: c("modal-reader-general-section") });
        currentAction.settings(detailsEl, this, this.communityAction, true);
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
        if (this.removed) {
            delete this.plugin.settings.installedTemplates.actions[this.communityAction.id];
        } else {
            this.plugin.settings.installedTemplates.actions[this.communityAction.id] = this.communityAction;
        }
        this.plugin.saveSettings();
        this.editCallback(this.communityAction, this.removed);
    }
}
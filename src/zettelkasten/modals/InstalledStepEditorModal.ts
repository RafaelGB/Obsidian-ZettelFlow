import { Notice, setIcon } from "obsidian";
import { StepBuilderInfo } from "zettelkasten";
import { StepBuilderMapper } from "zettelkasten";
import { c, log } from "architecture";
import { AbstractStepModal } from "./AbstractStepModal";
import { CommunityStepSettings } from "config";
import ZettelFlow from "main";
import { CommunityInfoHandler } from "./handlers/CommunityInfoHandler";
import { ConfirmModal } from "architecture/components/settings";
import { t } from "architecture/lang";

export class InstalledStepEditorModal extends AbstractStepModal {
    info: StepBuilderInfo;
    mode = "edit";
    builder = "ribbon";
    chain = new CommunityInfoHandler();
    private removed = false;
    constructor(
        private plugin: ZettelFlow,
        private communityStepInfo: CommunityStepSettings,
        private editCallback: (
            step: CommunityStepSettings,
            removed: boolean
        ) => void = () => { }
    ) {
        super(plugin.app);
        this.info = this.getBaseInfo();

    }

    getPlugin(): ZettelFlow {
        return this.plugin;
    }

    setNodeId(nodeId: string): InstalledStepEditorModal {
        this.info.nodeId = nodeId;
        return this;
    }

    onOpen(): void {
        const span = activeDocument.createElement("span", {});
        this.modalEl.addClass(c("modal"));
        // Header with title and subtitle with the mode
        const navbar = this.info.contentEl.createDiv({ cls: c("modal-navbar") });

        navbar.createEl("h2", { text: t("installed_step_editor_title") })

        // Separator
        navbar.appendChild(span);
        const navbarButtonGroup = navbar.createDiv({ cls: c("navbar-button-group") });

        // Add Uninstall button
        const uninstallButton = navbarButtonGroup.createEl("button", {
            placeholder: t("remove_button"),
            title: t("remove_step_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", async () => {
                new ConfirmModal(
                    this.plugin.app,
                    t("confirm_remove_step"),
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
            placeholder: t("step_builder_copy_button"),
            title: t("step_builder_copy_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", async () => {
                // Save step to clipboard
                navigator.clipboard.writeText(JSON.stringify(this.communityStepInfo, null, 2));
                this.plugin.settings.communitySettings.clipboardTemplate = this.communityStepInfo;
                await this.plugin.saveSettings();
                new Notice(t("step_copied_notice"));
            });

        });
        setIcon(useTemplateButton.createDiv(), "clipboard-copy");

        this.chain.handle(this);
    }

    refresh(): void {
        this.info.contentEl.empty();
        this.onOpen();
    }

    onClose(): void {
        this.saveStepToSettings()
            .then(() => {
                log.info(`Step saved to settings`);
                this.chain.postAction();
            })
            .catch((error) => {
                log.error(error);
                new Notice(`Error saving step, check console for more info`);
            });
    }


    private async saveStepToSettings(): Promise<void> {
        const stepSettings = StepBuilderMapper.StepBuilderInfo2CommunityStepSettings(this.info, this.communityStepInfo);
        if (this.removed) {
            delete this.plugin.settings.installedTemplates.steps[this.communityStepInfo.id];
        } else {
            this.plugin.settings.installedTemplates.steps[this.communityStepInfo.id] = stepSettings;
        }
        await this.plugin.saveSettings();
        this.editCallback(stepSettings, this.removed);
    }

    private getBaseInfo(): StepBuilderInfo {

        return {
            contentEl: this.contentEl,
            ...this.communityStepInfo,
            type: "not defined",
            root: this.communityStepInfo.root === undefined ? false : this.communityStepInfo.root,
            label: this.communityStepInfo.label === undefined ? `` : this.communityStepInfo.label,
            childrenHeader: this.communityStepInfo.childrenHeader === undefined ? `` : this.communityStepInfo.childrenHeader,
            actions: this.communityStepInfo.actions === undefined ? [] : this.communityStepInfo.actions,
        }

    }
}
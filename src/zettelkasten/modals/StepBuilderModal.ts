import { Notice, setIcon, TFile } from "obsidian";
import { StepBuilderInfo, StepSettings } from "zettelkasten";
import { StepTitleHandler } from "./handlers/StepTitleHandler";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { StepBuilderMapper } from "zettelkasten";
import { ObsidianApi, c, log } from "architecture";
import { canvas } from "architecture/plugin/canvas";
import { AbstractStepModal } from "./AbstractStepModal";
import ZettelFlow from "main";
import { InstalledStepEditorModal } from "./InstalledStepEditorModal";
import { UsedInstalledStepsModal } from "application/community";
import { ConfirmModal } from "architecture/components/settings";


export class StepBuilderModal extends AbstractStepModal {
    info: StepBuilderInfo;
    mode = "edit";
    builder = "ribbon";
    chain = new StepTitleHandler();
    constructor(
        private plugin: ZettelFlow,
        private partialInfo?: Partial<Omit<StepBuilderInfo, "containerEl">>
    ) {
        super(plugin.app);
        this.info = this.getBaseInfo();

    }

    getPlugin(): ZettelFlow {
        return this.plugin;
    }

    setMode(mode: "edit" | "create" | "embed"): StepBuilderModal {
        this.mode = mode;
        return this;
    }

    setBuilder(builder: "ribbon" | "editor"): StepBuilderModal {
        this.builder = builder;
        return this;
    }

    setNodeId(nodeId: string): StepBuilderModal {
        this.info.nodeId = nodeId;
        return this;
    }

    onOpen(): void {
        const span = activeDocument.createElement("span", {});
        this.modalEl.addClass(c("modal"));
        // Header with title and subtitle with the mode
        const navbar = this.info.contentEl.createDiv({ cls: c("modal-navbar") });

        navbar.createEl("h2", { text: t("step_builder_title") })

        // Separator
        navbar.appendChild(span);

        const navbarButtonGroup = navbar.createDiv({ cls: c("navbar-button-group") });

        // Add a button to save the step into the clipboard
        const clipboardButton = navbarButtonGroup.createEl("button", {
            placeholder: t("step_builder_copy_button"),
            title: t("step_builder_copy_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", async () => {
                // Step 1 - save the step internally
                const stepSettings = StepBuilderMapper.StepBuilderInfo2CommunityStepSettings(this.info, {
                    title: t("step_template_default_title"),
                    description: t("step_template_default_description")
                });
                // Step 2 - Copy the step to the clipboard
                navigator.clipboard.writeText(JSON.stringify(stepSettings, null, 2))
                // Step 3 - Save the step to internal clipboard
                this.plugin.settings.communitySettings.clipboardTemplate = stepSettings;
                await this.plugin.saveSettings();
                new Notice(t("step_copied_notice"));
            });

        });
        setIcon(clipboardButton.createDiv(), "clipboard-copy");

        // Add a button to apply an installed step template
        const useTemplateButton = navbarButtonGroup.createEl("button", {
            placeholder: t("step_builder_apply_button"),
            title: t("step_builder_apply_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", () => {
                new ConfirmModal(
                    this.plugin.app,
                    t("confirm_apply_template_step"),
                    t("confirm_apply_template_button"),
                    t("confirm_cancel_button"),
                    async () => {
                        // Step 1 - Open the modal to select the step
                        log.info("info before", this.info);
                        new UsedInstalledStepsModal(this.plugin, (step) => {
                            // Step 2 - Apply the step to the current step
                            this.partialInfo = {
                                ...this.info,
                                ...StepBuilderMapper.StepSettings2PartialStepBuilderInfo(step)
                            }
                            this.info = this.getBaseInfo();
                            log.info("info after", this.info);
                            // Step 3 - Refresh the modal
                            this.refresh();
                        }).open();
                    }
                ).open();
            });

        });
        setIcon(useTemplateButton.createDiv(), "pen");

        // Add a button to use this step as source for a installed step
        const saveButton = navbarButtonGroup.createEl("button", {
            placeholder: t("step_builder_save_template_button"),
            title: t("step_builder_save_template_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", () => {

                new ConfirmModal(
                    this.plugin.app,
                    t("confirm_add_step"),
                    t("confirm_add_button"),
                    t("confirm_cancel_button"),
                    async () => {
                        // Step 1 - save the step internally
                        const stepSettings = StepBuilderMapper.StepBuilderInfo2CommunityStepSettings(this.info, {
                            title: t("step_template_default_title"),
                            description: t("step_template_default_description"),
                            id: this.info.nodeId
                        });
                        if (this.plugin.settings.installedTemplates.steps[stepSettings.id]) {
                            new Notice(t("step_template_already_exists"));
                        }
                        this.plugin.settings.installedTemplates.steps[stepSettings.id] = stepSettings;
                        this.plugin.saveSettings();
                        // Step 2 - Open the modal to edit the step
                        new InstalledStepEditorModal(this.plugin, stepSettings).open();
                    }
                ).open();
            });

        });
        setIcon(saveButton.createDiv(), "book-marked");


        this.chain.handle(this);
    }

    refresh(): void {
        this.contentEl.empty();
        this.onOpen();
    }

    onClose(): void {
        this.save();
    }
    private save() {
        if (!this.info.folder || !this.info.filename) return;
        const path = this.info.folder.path.concat(FileService.PATH_SEPARATOR).concat(this.info.filename);
        switch (this.mode) {
            case "edit":
            case "create":
                this.saveFile(path.concat(".md"))
                    .then(() => {
                        log.info(`File ${path} saved`);
                        this.chain.postAction();
                    })
                    .catch((error) => {
                        log.error(error);
                        new Notice(`Error saving file ${path}, check console for more info`);
                    });
                break
            case "embed":
                this.saveEmbed(path.concat(".canvas"))
                    .then(() => {
                        log.info(`Embed with id ${this.info.nodeId} saved on ${path}`);
                        this.chain.postAction();
                    })
                    .catch((error) => {
                        log.error(error);
                        new Notice(`Error saving embed on ${path}, check console for more info`);
                    }
                    );
                break;
        }
    }

    private async saveEmbed(path: string): Promise<void> {
        if (this.info.nodeId) {
            const stepSettings = StepBuilderMapper.StepBuilderInfo2StepSettings(this.info);

            // Save path on cache or just get the cached flow
            const cachedFlow = await canvas.flows.update(path);
            await cachedFlow.editTextNode(this.info.nodeId, JSON.stringify(stepSettings));
        } else {
            log.error(`Node id not found on embed mode`);
        }
    }

    private async saveFile(path: string): Promise<void> {
        let file = await FileService.getFile(path, false);
        const stepSettings = StepBuilderMapper.StepBuilderInfo2StepSettings(this.info);
        if (!file) {
            // Create file
            file = await FileService.createFile(path, "", false);
        }
        await this.addStep(file, stepSettings);
        new Notice(`Step saved on ${path}`);
    }

    private async addStep(file: TFile, stepSettings: StepSettings): Promise<void> {
        ObsidianApi.fileManager().processFrontMatter(file, (frontmatter) => {
            frontmatter.zettelFlowSettings = {
                ...frontmatter.zettelFlowSettings,
                ...stepSettings
            }
        });
    }

    private getBaseInfo(): StepBuilderInfo {
        if (this.partialInfo === undefined) {
            return {
                type: "file",
                contentEl: this.contentEl,
                root: false,
                actions: [],
                label: ``,
                childrenHeader: ``,
            }
        } else {
            return {
                contentEl: this.contentEl,
                ...this.partialInfo,
                type: this.partialInfo.type === undefined ? `file` : this.partialInfo.type,
                root: this.partialInfo.root === undefined ? false : this.partialInfo.root,
                label: this.partialInfo.label === undefined ? `` : this.partialInfo.label,
                childrenHeader: this.partialInfo.childrenHeader === undefined ? `` : this.partialInfo.childrenHeader,
                actions: this.partialInfo.actions === undefined ? [] : this.partialInfo.actions,
            }
        }
    }
}
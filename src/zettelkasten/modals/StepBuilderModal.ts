import { Component, MarkdownRenderer, Notice, Platform, setIcon, TFile } from "obsidian";
import { StepBuilderInfo, StepSettings } from "zettelkasten";
import { StepTitleHandler } from "./handlers/StepTitleHandler";
import { t } from "architecture/lang";
import { FileService, FrontmatterService, VaultStateManager } from "architecture/plugin";
import { StepBuilderMapper } from "zettelkasten";
import { ObsidianApi, c, log } from "architecture";
import { canvas } from "architecture/plugin/canvas";
import { AbstractStepModal } from "./AbstractStepModal";
import ZettelFlow from "main";
import { InstalledStepEditorModal } from "./InstalledStepEditorModal";
import { UsedInstalledStepsModal } from "application/community";
import { ConfirmModal } from "architecture/components/settings";
import { substitutePreviewTokens } from "application/notes/previewUtils";

const PREVIEW_STORAGE_KEY = "zettelflow-preview-open";


export class StepBuilderModal extends AbstractStepModal {
    info: StepBuilderInfo;
    mode = "edit";
    builder = "ribbon";
    chain = new StepTitleHandler();

    private previewEl: HTMLElement | undefined;
    private previewComponent: Component | undefined;
    private debounceTimer: number | undefined;

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
        VaultStateManager.INSTANCE.freeze();
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
            el.addEventListener("click", () => {
                void (async () => {
                    // Step 1 - save the step internally
                    const stepSettings = StepBuilderMapper.StepBuilderInfo2CommunityStepSettings(this.info, {
                        title: t("step_template_default_title"),
                        description: t("step_template_default_description")
                    });
                    // Step 2 - Copy the step to the clipboard
                    void navigator.clipboard.writeText(JSON.stringify(stepSettings, null, 2))
                    // Step 3 - Save the step to internal clipboard
                    this.plugin.settings.communitySettings.clipboardTemplate = stepSettings;
                    await this.plugin.saveSettings();
                    new Notice(t("step_copied_notice"));
                })();
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
                        void this.plugin.saveSettings();
                        // Step 2 - Open the modal to edit the step
                        new InstalledStepEditorModal(this.plugin, stepSettings).open();
                    }
                ).open();
            });

        });
        setIcon(saveButton.createDiv(), "book-marked");

        // Preview toggle (desktop only)
        if (!Platform.isMobile && this.mode !== "embed") {
            const previewOpen = this.plugin.app.loadLocalStorage(PREVIEW_STORAGE_KEY) !== false;
            const toggleButton = navbarButtonGroup.createEl("button", {
                title: t("step_builder_preview_toggle_title")
            }, el => {
                el.addClass("mod-cta");
                el.toggleClass("is-active", previewOpen);
                el.addEventListener("click", () => {
                    const isOpen = this.plugin.app.loadLocalStorage(PREVIEW_STORAGE_KEY) !== false;
                    const next = !isOpen;
                    this.plugin.app.saveLocalStorage(PREVIEW_STORAGE_KEY, next);
                    el.toggleClass("is-active", next);
                    if (this.previewEl) {
                        this.previewEl.parentElement?.toggleClass(
                            c("step-builder-preview-wrapper--hidden"), !next
                        );
                    }
                });
            });
            setIcon(toggleButton.createDiv(), "eye");
        }

        this.chain.handle(this);

        // Body template + preview (desktop only, not in embed mode)
        if (!Platform.isMobile && this.mode !== "embed") {
            this.setupBodyAndPreview();
        }
    }

    refresh(): void {
        window.clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
        this.previewComponent?.unload();
        this.previewComponent = undefined;
        this.previewEl = undefined;
        this.contentEl.empty();
        this.onOpen();
    }

    private setupBodyAndPreview(): void {
        const { contentEl } = this.info;
        const textarea = contentEl.createEl("textarea", {
            cls: c("step-builder-body"),
            placeholder: t("step_builder_body_template_placeholder"),
        });
        textarea.value = this.info.body ?? "";
        textarea.addEventListener("input", () => {
            this.info.body = textarea.value;
            this.schedulePreviewUpdate();
        });

        const previewOpen = this.plugin.app.loadLocalStorage(PREVIEW_STORAGE_KEY) !== false;
        const wrapper = contentEl.createDiv({ cls: c("step-builder-preview-wrapper") });
        wrapper.toggleClass(c("step-builder-preview-wrapper--hidden"), !previewOpen);

        const header = wrapper.createDiv({ cls: c("step-builder-preview-header") });
        header.textContent = "Preview";

        this.previewEl = wrapper.createDiv({ cls: c("step-builder-preview-content") });

        // Load from file when editing (body undefined = not yet loaded)
        if (this.info.body === undefined && this.mode === "edit") {
            void this.loadBodyFromFile(textarea);
        } else {
            this.schedulePreviewUpdate();
        }
    }

    private async loadBodyFromFile(textarea: HTMLTextAreaElement): Promise<void> {
        if (!this.info.folder || !this.info.filename) return;
        const path = `${this.info.folder.path}${FileService.PATH_SEPARATOR}${this.info.filename}.md`;
        const file = await FileService.getFile(path, false);
        if (!file) return;
        const body = await FrontmatterService.instance(file).getContent();
        this.info.body = body;
        textarea.value = body;
        this.schedulePreviewUpdate();
    }

    private schedulePreviewUpdate(): void {
        window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => {
            this.debounceTimer = undefined;
            void this.renderPreview();
        }, 300);
    }

    private async renderPreview(): Promise<void> {
        if (!this.previewEl) return;
        this.previewComponent?.unload();
        this.previewComponent = new Component();
        this.previewComponent.load();

        this.previewEl.empty();
        const date = new Date().toISOString().split("T")[0];
        const substituted = substitutePreviewTokens(
            this.info.body ?? "",
            this.info.label,
            date
        );
        await MarkdownRenderer.render(
            this.plugin.app,
            substituted || `*${t("step_builder_preview_placeholder")}*`,
            this.previewEl,
            this.info.folder?.path ?? "",
            this.previewComponent
        );
    }

    onClose(): void {
        window.clearTimeout(this.debounceTimer);
        this.previewComponent?.unload();
        this.save().then(() => {
            log.info(`Step saved successfully`);
        }).catch((error) => {
            log.error(`Error saving step: ${error}`);
            new Notice(`Error saving step, check console for more info`);
        }).finally(() => {
            VaultStateManager.INSTANCE.defrost();
        });
    }

    private async save() {
        if (!this.info.folder || !this.info.filename) {
            log.error("[StepBuilder] Cannot save step: missing target folder or filename", this.info);
            new Notice(t("step_builder_save_missing_target"));
            return;
        }
        const path = this.info.folder.path.concat(FileService.PATH_SEPARATOR).concat(this.info.filename);
        switch (this.mode) {
            case "edit":
            case "create": {
                await this.saveFile(path.concat(".md"));
                log.info(`File ${path} saved`);
                break;
            }
            case "embed": {
                await this.saveEmbed(path.concat(".canvas"));
                log.info(`Embed with id ${this.info.nodeId} saved on ${path}`);
                break;
            }
            default: {
                log.error(`Unknown mode ${this.mode}`);
                throw new Error(`Unknown mode ${this.mode}`);
            }
        }
        this.chain.postAction();
    }

    private async saveEmbed(path: string): Promise<void> {
        if (this.info.nodeId) {
            const stepSettings = StepBuilderMapper.StepBuilderInfo2StepSettings(this.info);

            // Save path on cache or just get the cached flow
            const cachedFlow = await canvas.flows.update(path);
            await cachedFlow.editTextNode(this.info.nodeId, JSON.stringify(stepSettings));
        } else {
            log.error(`Node id not found on embed mode`);
            new Notice(t("step_builder_save_missing_node"));
        }
    }

    private async saveFile(path: string): Promise<void> {
        let file = await FileService.getFile(path, false);
        const stepSettings = StepBuilderMapper.StepBuilderInfo2StepSettings(this.info);
        const body = this.info.body;
        if (!file) {
            file = await FileService.createFile(path, body ?? "", false);
        } else if (body !== undefined) {
            await this.updateFileBody(file, body);
        }
        await this.addStep(file, stepSettings);
        new Notice(`Step saved on ${path}`);
    }

    private async updateFileBody(file: TFile, body: string): Promise<void> {
        const raw = await FileService.getContent(file);
        const fmMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
        const frontmatterBlock = fmMatch ? fmMatch[0] : "";
        await FileService.modify(file, frontmatterBlock + body);
    }

    private async addStep(file: TFile, stepSettings: StepSettings): Promise<void> {
        // Must be awaited: save() runs from onClose and defrosts the vault state right after,
        // so a fire-and-forget write could be dropped and the step never persisted (#79).
        await ObsidianApi.fileManager().processFrontMatter(file, (frontmatter: Record<string, unknown> & { zettelFlowSettings?: Record<string, unknown> }) => {
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
                body: "",
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
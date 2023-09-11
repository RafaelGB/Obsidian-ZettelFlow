import { App, Modal, Notice, TFile } from "obsidian";
import { StepBuilderInfo, StepSettings } from "zettelkasten";
import { StepTitleHandler } from "./handlers/StepTitleHandler";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { StepBuilderMapper } from "zettelkasten";
import { ObsidianApi, log } from "architecture";


export class StepBuilderModal extends Modal {
    info: StepBuilderInfo;
    mode = "edit";
    constructor(app: App, private partialInfo?: Partial<Omit<StepBuilderInfo, "containerEl">>) {
        super(app);
        this.info = this.getBaseInfo();
    }

    setMode(mode: "edit" | "create"): StepBuilderModal {
        this.mode = mode;
        return this;
    }

    onOpen(): void {
        const span = activeDocument.createElement("span", {});
        span.setText(` (${this.mode})`);
        // Header with title and subtitle with the mode
        this.info.contentEl.createEl("h2", { text: t("step_builder_title") })
            // Separator
            .appendChild(span);
        new StepTitleHandler().handle(this);
    }

    refresh(): void {
        this.info.contentEl.empty();
        this.onOpen();
    }

    onClose(): void {
        console.log("Closing StepBuilderModal");
        if (!this.info.folder || !this.info.filename) return;
        const path = this.info.folder.path.concat(FileService.PATH_SEPARATOR).concat(this.info.filename).concat(".md");
        this.saveFile(path).catch((error) => {
            log.error(error);
            new Notice(`Error saving file ${path}, check console for more info`);
        });
    }

    private async saveFile(path: string): Promise<void> {
        let file = await FileService.getFile(path, false);
        const stepSettings = StepBuilderMapper.StepBuilderInfo2StepSettings(this.info);
        if (!file) {
            // Create file
            file = await FileService.createFile(path, "", false);
        }
        await this.addStep(file, stepSettings);
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
                contentEl: this.contentEl,
                isRoot: false,
                element: {
                    type: `bridge`
                },
                label: ``,
                childrenHeader: ``,
                path: ``
            }
        } else {
            return {
                contentEl: this.contentEl,
                ...this.partialInfo,
                isRoot: this.partialInfo.isRoot === undefined ? false : this.partialInfo.isRoot,
                element: this.partialInfo.element === undefined ? { type: `bridge` } : this.partialInfo.element,
                label: this.partialInfo.label === undefined ? `` : this.partialInfo.label,
                childrenHeader: this.partialInfo.childrenHeader === undefined ? `` : this.partialInfo.childrenHeader,
                path: this.partialInfo.path === undefined ? `` : this.partialInfo.path,
            }
        }
    }
}
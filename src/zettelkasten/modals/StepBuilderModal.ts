import { App, Modal, Notice, TFile } from "obsidian";
import { StepBuilderInfo, StepSettings } from "zettelkasten";
import { StepTitleHandler } from "./handlers/StepTitleHandler";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { StepBuilderMapper } from "zettelkasten";
import { ObsidianApi, log } from "architecture";
import { canvas } from "architecture/plugin/canvas";


export class StepBuilderModal extends Modal {
    info: StepBuilderInfo;
    mode = "edit";
    chain = new StepTitleHandler();
    constructor(app: App, private partialInfo?: Partial<Omit<StepBuilderInfo, "containerEl">>) {
        super(app);
        this.info = this.getBaseInfo();

    }

    setMode(mode: "edit" | "create" | "embed"): StepBuilderModal {
        this.mode = mode;
        return this;
    }

    setNodeId(nodeId: string): StepBuilderModal {
        this.info.nodeId = nodeId;
        return this;
    }

    onOpen(): void {
        const span = activeDocument.createElement("span", {});
        this.contentEl.parentElement?.style.setProperty("width", "100%");
        span.setText(` (${this.mode})`);
        // Header with title and subtitle with the mode
        this.info.contentEl.createEl("h2", { text: t("step_builder_title") })
            // Separator
            .appendChild(span);
        this.chain.handle(this);
    }

    refresh(): void {
        this.info.contentEl.empty();
        this.onOpen();
    }

    onClose(): void {
        if (!this.info.folder || !this.info.filename) return;
        const path = this.info.folder.path.concat(FileService.PATH_SEPARATOR).concat(this.info.filename);
        switch (this.mode) {
            case "edit" || "create":
                this.saveFile(path.concat(".md")).catch((error) => {
                    log.error(error);
                    new Notice(`Error saving file ${path}, check console for more info`);
                });
                this.chain.postAction();
                break
            case "embed":
                this.saveEmbed(path.concat(".canvas")).catch((error) => {
                    log.error(error);
                    new Notice(`Error saving embed on ${path}, check console for more info`);
                }
                );
                this.chain.postAction();
                break;
        }
    }

    private async saveEmbed(path: string): Promise<void> {
        if (this.info.nodeId) {
            const stepSettings = StepBuilderMapper.StepBuilderInfo2StepSettings(this.info);
            await canvas.flows.update(path);
            await canvas.flows
                .get(path)
                .editTextNode(this.info.nodeId, JSON.stringify(stepSettings, null, 2));
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
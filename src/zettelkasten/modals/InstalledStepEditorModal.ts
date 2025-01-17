import { Notice } from "obsidian";
import { StepBuilderInfo } from "zettelkasten";
import { t } from "architecture/lang";
import { StepBuilderMapper } from "zettelkasten";
import { c, log } from "architecture";
import { AbstractStepModal } from "./AbstractStepModal";
import { CommunityStepSettings } from "config";
import ZettelFlow from "main";
import { CommunityInfoHandler } from "./handlers/CommunityInfoHandler";

export class InstalledStepEditorModal extends AbstractStepModal {
    info: StepBuilderInfo;
    mode = "edit";
    builder = "ribbon";
    chain = new CommunityInfoHandler();
    constructor(
        private plugin: ZettelFlow,
        private communityStepInfo: CommunityStepSettings,
        private editCallback: (step: CommunityStepSettings) => void
    ) {
        super(plugin.app);
        this.info = this.getBaseInfo();

    }

    setNodeId(nodeId: string): InstalledStepEditorModal {
        this.info.nodeId = nodeId;
        return this;
    }

    onOpen(): void {
        const span = activeDocument.createElement("span", {});
        this.modalEl.addClass(c("modal"));
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
        console.log(stepSettings);
        this.plugin.settings.installedTemplates.steps[this.communityStepInfo._id] = stepSettings;
        await this.plugin.saveSettings();
        this.editCallback(stepSettings);
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
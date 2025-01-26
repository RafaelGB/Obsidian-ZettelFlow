import { ActionSettingReader } from "architecture/api";
import { backlinkDetails } from "./BackLinkSettings";
import { AbstractStepModal } from "zettelkasten/modals/AbstractStepModal";
import ZettelFlow from "main";
import { StepBuilderInfo } from "zettelkasten";
import { ObsidianApi } from "architecture";
import { App } from "obsidian";

class MockModal extends AbstractStepModal {
    info: StepBuilderInfo;
    getPlugin(): ZettelFlow {
        throw new Error("Method not implemented.");
    }
    mode: string;
    builder: string;
    refresh(): void {
        throw new Error("Method not implemented.");
    }
    constructor(app: App, info: StepBuilderInfo) {
        super(app);
        this.info = info;
    }
}
export const backLinkSettingsReader: ActionSettingReader = (contentEl, action) => {
    // TODO: Implement backlink settings reader
    const modal = new MockModal(ObsidianApi.globalApp(), {
        type: "mockType",
        contentEl: contentEl,
        optional: false,
        root: false,
        actions: [],
        label: "mockLabel",
    });
    backlinkDetails(modal, action, contentEl, true);
}
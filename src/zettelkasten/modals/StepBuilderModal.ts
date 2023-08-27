import { App, Modal } from "obsidian";
import { StepBuilderInfo } from "zettelkasten";
import { RootToggleHandler } from "./handlers/RootToggleHandler";


export class StepBuilderModal extends Modal {
    private info: StepBuilderInfo;
    constructor(app: App) {
        super(app);
        this.info = this.getBaseInfo();
    }

    onOpen(): void {
        this.info = new RootToggleHandler().handle(this.info);
    }

    onClose(): void {
    }

    private getBaseInfo(): StepBuilderInfo {
        return {
            isRoot: false,
            element: {
                type: `bridge`
            },
            label: ``,
            childrenHeader: ``,
        }
    }
}
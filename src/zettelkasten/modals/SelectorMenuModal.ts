import { App, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import ZettelFlow from "main";
import { buildSelectorMenu } from "application/components/noteBuilder";
import { Flow } from "architecture/plugin/canvas";
import { buildTutorial } from "application/components/noteBuilder/SelectorMenu";
export class SelectorMenuModal extends Modal {
    private root: Root;

    constructor(app: App, private plugin: ZettelFlow, private flow?: Flow) {
        super(app);
    }
    onOpen(): void {
        const child = this.contentEl.createDiv();
        this.root = createRoot(child);
        if (this.flow) {
            this.root.render(
                buildSelectorMenu(
                    {
                        plugin: this.plugin,
                        modal: this,
                        flow: this.flow,

                    }
                )
            );
        } else {
            this.root.render(
                buildTutorial(
                    {
                        plugin: this.plugin,
                        modal: this,
                    }
                )
            );
        }
    }

    onClose(): void {
        this.root.unmount();
    }

}
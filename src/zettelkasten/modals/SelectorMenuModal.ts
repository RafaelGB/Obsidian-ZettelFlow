import { App, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import ZettelFlow from "main";
import { buildSelectorMenu, NoteBuilderType } from "components/noteBuilder";
import { canvas } from "architecture/plugin/canvas";
export class SelectorMenuModal extends Modal {
    private root: Root;

    constructor(app: App, private plugin: ZettelFlow) {
        super(app);
    }
    onOpen(): void {
        const child = this.contentEl.createDiv();
        this.root = createRoot(child);
        console.log("SelectorMenuModal onOpen");
        const selectorMenu = buildSelectorMenu(this.getNoteBuilderType());
        this.root.render(selectorMenu);
    }

    onClose(): void {
        this.root.unmount();
    }

    private getNoteBuilderType(): NoteBuilderType {
        return {
            // TODO: just 1 flow for now
            flow: canvas.flows.get(this.plugin.settings.canvasFilePath),
            plugin: this.plugin,
            modal: this
        }
    }

}
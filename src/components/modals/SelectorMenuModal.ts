import { App, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { buildSelectorMenu } from "../NoteBuilder/SelectorMenu";
import ZettlelFlow from "main";
import { NoteBuilderType } from "components/NoteBuilder/model/NoteBuilderModel";
export class SelectorMenuModal extends Modal {
    private root :Root;
    
    constructor(app: App, private plugin:ZettlelFlow) {
        super(app);
    }
    onOpen(): void {
        const child=this.contentEl.createDiv();
        this.root = createRoot(child);
        const selectorMenu = buildSelectorMenu(this.getNoteBuilderType());
        this.root.render(selectorMenu);
    }

    onClose(): void {
        this.root.unmount();
    }

    private getNoteBuilderType(): NoteBuilderType {
        return {
            plugin: this.plugin,
            modal: this
        }
    }

}
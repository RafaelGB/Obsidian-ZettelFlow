import { buildSelectorMenu } from "components/SelectorMenu";
import { App, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";

export class SelectorMenuModal  extends Modal {
    private root :Root;

    constructor(app: App) {
        super(app);
    }
    onOpen(): void {
        this.root = createRoot(this.contentEl);
        const selectorMenu = buildSelectorMenu();
        this.root.render(selectorMenu);
    }

    onClose(): void {
        this.root.unmount();
    }

}
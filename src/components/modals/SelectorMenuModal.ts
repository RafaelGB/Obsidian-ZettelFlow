import { App, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { buildSelectorMenu } from "../SelectorMenu";
import { t } from "architecture/lang";
export class SelectorMenuModal  extends Modal {
    private root :Root;

    constructor(app: App) {
        super(app);
    }
    onOpen(): void {
        this.contentEl.createEl('h2', {text: t('selector_menu_title')});
        this.root = createRoot(this.contentEl);
        const selectorMenu = buildSelectorMenu();
        this.root.render(selectorMenu);
    }

    onClose(): void {
        this.root.unmount();
    }

}
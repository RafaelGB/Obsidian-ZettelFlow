import { c } from "architecture";
import { actionsStore } from "architecture/api";
import { CommunityAction } from "config";
import ZettelFlow from "main";
import { Modal, setIcon } from "obsidian";

export class CommunityActionModal extends Modal {
  constructor(private plugin: ZettelFlow, private action: CommunityAction) {
    super(plugin.app);
  }
  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    // Show title and description as header of the modal
    this.titleEl.setText(this.action.title);
    this.contentEl.createEl("p", { text: this.action.description });
    // Show the type of the action with the corresponding icon
    const currentAction = actionsStore.getAction(this.action.type);
    const type = this.contentEl.createDiv();
    setIcon(type, currentAction.getIcon());
    currentAction.settings;
  }
}

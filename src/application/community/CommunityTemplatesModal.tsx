import ZettelFlow from "main";
import { Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";

export class CommunityTemplatesModal extends Modal {
  private root: Root;
  constructor(plugin: ZettelFlow) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("mod-sidebar-layout");
    const child = this.contentEl.createDiv();
    this.root = createRoot(child);
  }
}

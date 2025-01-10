import { App, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";

export class ManageInstalledTemplatesModal extends Modal {
  private root: Root;
  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("mod-sidebar-layout");
    const child = this.contentEl.createDiv();
    this.root = createRoot(child);
  }
}

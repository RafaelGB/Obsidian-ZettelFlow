import { c } from "architecture";
import ZettelFlow from "main";
import { Modal } from "obsidian";

export class ObsidianTypesModal extends Modal {
  constructor(private plugin: ZettelFlow) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass(c("modal"));
  }
}

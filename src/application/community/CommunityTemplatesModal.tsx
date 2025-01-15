import { c } from "architecture";
import ZettelFlow from "main";
import { Modal } from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { CommunityTemplatesGallery } from "./components/CommunityTemplatesGallery";

export class CommunityTemplatesModal extends Modal {
  private root: Root;
  constructor(private plugin: ZettelFlow) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    const child = this.contentEl.createDiv();
    this.root = createRoot(child);
    this.root.render(<CommunityTemplatesGallery plugin={this.plugin} />);
  }
}

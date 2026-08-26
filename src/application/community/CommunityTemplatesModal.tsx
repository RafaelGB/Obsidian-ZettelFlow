import { c } from "architecture";
import ZettelFlow from "main";
import { Modal } from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { CommunityHub } from "./components/CommunityHub";
import { t } from "architecture/lang";

export class CommunityTemplatesModal extends Modal {
  private root: Root;
  constructor(private plugin: ZettelFlow) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass(c("modal"));

    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });
    navbar.createEl("h2", { text: t("modals_community_templates_title") });
    // Contributing now lives in the Hub's Contribute tab (#294 S3) — no navbar link needed.

    const child = this.contentEl.createDiv();
    this.root = createRoot(child);
    // The community gallery is fully static (GitHub-backed) — the Hub tabs it, no backend.
    this.root.render(<CommunityHub plugin={this.plugin} />);
  }

  onClose(): void {
    // Unmount the React tree so its effects/observers/timers stop when the modal closes.
    this.root?.unmount();
    this.contentEl.empty();
  }
}

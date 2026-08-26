import { c } from "architecture";
import ZettelFlow from "main";
import { Modal } from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { StaticTemplatesGallery } from "./components/StaticTemplatesGallery";
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
    const navbarButtonGroup = navbar.createDiv({
      cls: c("navbar-button-group"),
    });
    // Link to add a new template to the community gallery via GitHub Issue
    navbarButtonGroup.createEl(
      "a",
      {
        href: "https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=ADD_TEMPLATE.yaml",
        text: t("modals_community_templates_add_template"),
      },
      (el) => {
        el.addClass("mod-cta");
      }
    );

    const child = this.contentEl.createDiv();
    this.root = createRoot(child);
    // The community gallery is fully static (GitHub-backed) — always the static gallery, no backend.
    this.root.render(<StaticTemplatesGallery plugin={this.plugin} />);
  }

  onClose(): void {
    // Unmount the React tree so its effects/observers/timers stop when the modal closes.
    this.root?.unmount();
    this.contentEl.empty();
  }
}

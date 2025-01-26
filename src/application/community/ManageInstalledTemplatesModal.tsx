import { c } from "architecture";
import ZettelFlow from "main";
import { Modal, setIcon } from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { InstalledTemplatesManagement } from "./components/InstalledTemplatesManagement";
import { t } from "architecture/lang";
import { CommunityAction, CommunityStepSettings } from "config";

export class ManageInstalledTemplatesModal extends Modal {
  private root: Root;
  constructor(private plugin: ZettelFlow) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    this.render();
  }

  private render(): void {
    this.contentEl.empty();
    // Header with title and subtitle with the mode
    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });

    navbar.createEl("h2", { text: t("manage_installed_templates_title") });

    // Separator
    const span = activeDocument.createElement("span", {});
    navbar.appendChild(span);

    const navbarButtonGroup = navbar.createDiv({
      cls: c("navbar-button-group"),
    });

    const potentialSavedTempate =
      this.plugin.settings.communitySettings.clipboardTemplate;
    if (potentialSavedTempate) {
      // Add a button to import a template from the clipboard
      const importButton = navbarButtonGroup.createEl(
        "button",
        {
          placeholder: "Add template from clipboard",
          title: "Add template from clipboard to installed templates",
        },
        (el) => {
          el.addClass("mod-cta");
          el.addEventListener("click", () => {
            if (potentialSavedTempate.template_type === "step") {
              this.plugin.settings.installedTemplates.steps[
                potentialSavedTempate.id
              ] = potentialSavedTempate as CommunityStepSettings;
            } else if (potentialSavedTempate.template_type === "action") {
              this.plugin.settings.installedTemplates.actions[
                potentialSavedTempate.id
              ] = potentialSavedTempate as CommunityAction;
            }
            delete this.plugin.settings.communitySettings.clipboardTemplate;
            this.plugin.saveSettings();
            this.refresh();
          });
        }
      );
      setIcon(importButton.createDiv(), "clipboard-paste");
    }

    const child = this.contentEl.createDiv();
    this.root = createRoot(child);
    this.root.render(<InstalledTemplatesManagement plugin={this.plugin} />);
  }

  private refresh(): void {
    this.root.unmount();
    this.render();
  }
}

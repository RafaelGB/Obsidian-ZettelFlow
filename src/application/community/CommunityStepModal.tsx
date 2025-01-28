import { c } from "architecture";
import { actionsStore } from "architecture/api";
import { ConfirmModal } from "architecture/components/settings";
import { MarkdownService } from "architecture/plugin";
import { CommunityStepSettings } from "config";
import ZettelFlow from "main";
import { Component, Modal, setIcon } from "obsidian";
import { InstalledStepEditorModal } from "zettelkasten/modals/InstalledStepEditorModal";

export class CommunityStepModal extends Modal {
  constructor(
    private plugin: ZettelFlow,
    private step: CommunityStepSettings,
    private callback: () => void
  ) {
    super(plugin.app);
  }
  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    this.renderContent();
  }

  private renderContent() {
    // Clear the previous content
    this.contentEl.empty();

    // Header with title and subtitle with the mode
    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });

    navbar.createEl("h2", { text: this.step.title });

    const navbarButtonGroup = navbar.createDiv({
      cls: c("navbar-button-group"),
    });

    const isInstalled = this.isTemplateInstalled(this.step);
    const buttonTitle = isInstalled ? "Remove" : "Install";

    if (isInstalled) {
      navbarButtonGroup.createEl(
        "button",
        {
          placeholder: "Manage",
          title: "Manage",
          text: "Manage",
        },
        (el) => {
          el.addClass("mod-cta");
          el.addEventListener("click", () => {
            new InstalledStepEditorModal(this.plugin, this.step).open();
            // close the current modal as we are opening a new one
            this.close();
          });
        }
      );
    }
    // Add a button to remove/install the step
    navbarButtonGroup.createEl(
      "button",
      {
        placeholder: buttonTitle,
        title: buttonTitle,
        text: buttonTitle,
      },
      (el) => {
        el.addClass("mod-cta");
        el.addEventListener("click", () => {
          if (isInstalled) {
            new ConfirmModal(
              this.plugin.app,
              "Are you sure you want to remove this action?",
              "Remove",
              "Cancel",
              async () => {
                delete this.plugin.settings.installedTemplates.steps[
                  this.step.id
                ];
                this.callback();
                this.plugin.saveSettings();
                this.renderContent();
              }
            ).open();
          } else {
            this.plugin.settings.installedTemplates.steps[this.step.id] =
              this.step;
            this.callback();
            this.plugin.saveSettings();
            this.renderContent();
          }
        });
      }
    );

    const generalInfoEl = this.contentEl.createDiv({
      cls: c("modal-reader-general-section"),
    });
    const descriptionEl = generalInfoEl.createDiv();

    const mdContent = `**Author**: ${this.step.author}
    **Target folder**: ${this.step.targetFolder}
    **Opcional**: ${this.step.optional ? "✅" : "❌"}
    **Root**: ${this.step.root ? "✅" : "❌"}
    
---

${this.step.description}`;
    const comp = new Component();
    MarkdownService.render(
      this.plugin.app,
      mdContent,
      descriptionEl,
      "/",
      comp
    );

    this.contentEl.createEl("h3", { text: "Actions" });
    for (const action of this.step.actions) {
      const actionEl = this.contentEl.createDiv({
        cls: c("modal-reader-action-section"),
      });
      const currentAction = actionsStore.getAction(action.type);
      actionEl.createEl("p", { text: `Type: ${currentAction.getLabel()}` });
      actionEl.createEl("p", { text: `Description: ${action.description}` });
      setIcon(actionEl.createDiv(), currentAction.getIcon());
      const settingsSection = this.contentEl.createDiv({
        cls: c("modal-reader-section"),
      });
      currentAction.settingsReader(settingsSection, action);
      this.contentEl.createEl("hr");
    }
  }

  private isTemplateInstalled(template: CommunityStepSettings): boolean {
    return !!this.plugin.settings.installedTemplates.steps[template.id];
  }

  onClose(): void {
    let { contentEl } = this;
    contentEl.empty();
  }
}

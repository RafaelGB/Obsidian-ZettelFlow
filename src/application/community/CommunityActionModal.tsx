import { c } from "architecture";
import { actionsStore } from "architecture/api";
import { MarkdownService } from "architecture/plugin";
import { CommunityAction } from "config";
import ZettelFlow from "main";
import { Component, Modal, setIcon } from "obsidian";

export class CommunityActionModal extends Modal {
  constructor(private plugin: ZettelFlow, private action: CommunityAction) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    this.renderContent();
  }

  private renderContent() {
    // Clear the previous content
    this.contentEl.empty();

    const currentAction = actionsStore.getAction(this.action.type);
    // Header with title and subtitle with the mode
    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });

    navbar.createEl("h2", { text: this.action.title });

    const navbarButtonGroup = navbar.createDiv({
      cls: c("navbar-button-group"),
    });

    const isInstalled = this.isTemplateInstalled(this.action);
    const buttonTitle = isInstalled ? "Desinstalar" : "Instalar";

    // Add a button to apply an installed step template
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
            delete this.plugin.settings.installedTemplates.actions[
              this.action.id
            ];
          } else {
            this.plugin.settings.installedTemplates.actions[this.action.id] =
              this.action;
          }
          this.plugin.saveSettings();
          this.renderContent();
        });
      }
    );

    const typeEl = this.contentEl.createDiv({
      cls: c("modal-reader-type-section"),
    });
    typeEl.createEl("p", { text: `Type: ${currentAction.getLabel()}` });
    setIcon(typeEl.createDiv(), currentAction.getIcon());

    const generalInfoEl = this.contentEl.createDiv({
      cls: c("modal-reader-general-section"),
    });
    const descriptionEl = generalInfoEl.createDiv();

    const comp = new Component();
    MarkdownService.render(
      this.plugin.app,
      this.action.description,
      descriptionEl,
      "/",
      comp
    );

    // Sección de Configuración
    const settingsSection = this.contentEl.createDiv({
      cls: c("modal-reader-section"),
    });
    currentAction.settingsReader(settingsSection, this.action);
  }

  private isTemplateInstalled(template: CommunityAction): boolean {
    return !!this.plugin.settings.installedTemplates.actions[template.id];
  }

  onClose(): void {
    let { contentEl } = this;
    contentEl.empty();
  }
}

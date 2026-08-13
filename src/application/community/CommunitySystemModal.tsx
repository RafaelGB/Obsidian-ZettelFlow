import { Modal, Notice, Setting, requestUrl } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { FolderSuggest } from "architecture/settings";
import ZettelFlow from "main";
import { ZfTemplate } from "application/template/zfTemplate";
import { planSystemInstall } from "./systemInstall";
import { COMMUNITY_BASE_URL } from "./services/CommunityHttpClientService";

/**
 * Modal for a community **system** (#214): a `.zftemplate` bundle installed as a canvas + step notes
 * in one click. Mirrors {@link CommunityFlowModal} but consumes the unified `.zftemplate` format and
 * writes real files through {@link FileService.writeFile} instead of the clipboard-paste dance.
 */
export class CommunitySystemModal extends Modal {
  private targetFolder: string;
  private imageUrl = `${COMMUNITY_BASE_URL}${this.refUrl.replace(
    /\.zftemplate$/,
    ".png"
  )}`;
  private objectUrl: string | null = null;

  constructor(
    plugin: ZettelFlow,
    private template: ZfTemplate,
    private refUrl: string
  ) {
    super(plugin.app);
    // Default install location is the configured flows folder; the user can override it below.
    this.targetFolder = plugin.settings.foldersFlowsPath || "";
  }

  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    void this.renderContent();
  }

  /**
   * Fetches the optional sibling preview image (`<id>.png`) as a Blob URL. Systems may ship without
   * one (the author drops it in later), so a miss is expected — logged at debug, not surfaced.
   */
  private async fetchSystemImage(): Promise<string | null> {
    try {
      const response = await requestUrl({ url: this.imageUrl });
      const buffer = response.arrayBuffer;
      const mimeType =
        response.headers["content-type"] ?? "application/octet-stream";
      const blob = new Blob([buffer], { type: mimeType });
      this.objectUrl = URL.createObjectURL(blob);
      return this.objectUrl;
    } catch (error) {
      log.debug("No preview image for system:", this.imageUrl, error);
      return null;
    }
  }

  private async renderContent(): Promise<void> {
    this.contentEl.empty();

    // --- Header ---
    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });
    navbar.createEl("h2", { text: this.template.name });

    // --- Description ---
    const infoSection = this.contentEl.createDiv({
      cls: c("modal-reader-general-section"),
    });
    infoSection.createEl("p", {
      text: `${t("template_author")}: ${this.template.author}`,
    });
    infoSection.createEl("p", { text: this.template.description });

    // --- Optional preview image ---
    const imgUrl = await this.fetchSystemImage();
    if (imgUrl) {
      const imgSection = this.contentEl.createDiv({
        cls: c("modal-reader-flow-image-section"),
      });
      imgSection.createEl("h3", { text: t("community_system_preview") });
      const container = imgSection.createDiv({
        cls: c("flow-image-container"),
      });
      const imgEl = container.createEl("img", {
        attr: { src: imgUrl, alt: `${this.template.name} preview` },
      });
      imgEl.addClass(c("flow-image-fit"));
    }

    // --- What gets installed ---
    const contentsSection = this.contentEl.createDiv({
      cls: c("modal-reader-general-section"),
    });
    contentsSection.createEl("h3", { text: t("community_system_contents") });
    const list = contentsSection.createEl("ul", { cls: c("flow-nodes-list") });
    list.createEl("li", { text: this.template.canvas.filename });
    for (const step of this.template.steps) {
      list.createEl("li", { text: step.filename });
    }

    // --- Install location ---
    new Setting(this.contentEl)
      .setName(t("community_system_install_location"))
      .setDesc(t("community_system_install_location_desc"))
      .addSearch((cb) => {
        new FolderSuggest(cb.inputEl);
        cb.setValue(this.targetFolder).onChange((value) => {
          this.targetFolder = value;
        });
      });

    // --- Install button ---
    new Setting(this.contentEl).addButton((btn) => {
      btn
        .setButtonText(t("community_system_install_button"))
        .setCta()
        .onClick(() => {
          void this.installSystem();
        });
    });
  }

  /**
   * Writes every planned file (canvas first, then each step), opens the canvas, and closes the modal.
   * Idempotent by way of {@link FileService.writeFile} (overwrite-in-place).
   */
  private async installSystem(): Promise<void> {
    try {
      const { files } = planSystemInstall(this.template, this.targetFolder);
      for (const file of files) {
        await FileService.writeFile(file.path, file.content, false);
      }
      new Notice(`${this.template.name} — ${t("community_system_installed")}`);
      this.close();
      if (files.length > 0) {
        await FileService.openFile(files[0].path);
      }
    } catch (error) {
      log.error("Error installing community system:", error);
      new Notice(t("community_system_install_error"));
    }
  }

  onClose(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.contentEl.empty();
  }
}

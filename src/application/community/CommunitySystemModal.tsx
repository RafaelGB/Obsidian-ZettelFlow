import { Modal, Notice, Setting, requestUrl } from "obsidian";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { FolderSuggest } from "architecture/settings";
import ZettelFlow from "main";
import { ZfTemplate } from "application/template/zfTemplate";
import {
  planSystemInstall,
  validateSystemTemplate,
  sanitizeFolderSegment,
  REGISTERED_ACTION_IDS,
} from "./systemInstall";
import { COMMUNITY_BASE_URL } from "./services/CommunityHttpClientService";

/**
 * Modal for a community **system** (#214): a `.zftemplate` bundle installed as a canvas + step notes
 * in one click. Consumes the unified `.zftemplate` format and writes real files through
 * {@link FileService.writeFile} (no clipboard-paste dance).
 */
export class CommunitySystemModal extends Modal {
  private targetFolder: string;
  private imageUrl = `${COMMUNITY_BASE_URL}${this.refUrl.replace(
    /\.zftemplate$/,
    ".png"
  )}`;
  private objectUrl: string | null = null;
  /** Set in `onClose`; guards the async image load against a close-before-fetch race. */
  private disposed = false;

  constructor(
    private plugin: ZettelFlow,
    private template: ZfTemplate,
    private refUrl: string
  ) {
    super(plugin.app);
    // Default install location is a per-system subfolder of the configured flows folder — keeps each
    // system's canvas + steps together and avoids cross-system filename collisions. Overridable below.
    // The system name is remote/untrusted content, so it is sanitized to a single safe folder segment
    // before use (a crafted name must not steer the default outside the flows folder). Overridable.
    const base = plugin.settings.foldersFlowsPath || "";
    const segment = sanitizeFolderSegment(template.name);
    this.targetFolder = segment ? (base ? `${base}/${segment}` : segment) : base;
  }

  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    this.renderContent();
  }

  private renderContent(): void {
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

    // --- Optional preview image (loaded asynchronously so install stays usable offline) ---
    const imgSection = this.contentEl.createDiv({
      cls: c("modal-reader-flow-image-section"),
    });
    void this.loadImage(imgSection);

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
   * Fetches the optional sibling preview image (`<id>.png`) and appends it. Systems may ship without
   * one (the author drops it in later), so a miss is expected — logged at debug, not surfaced. Bails
   * if the modal was closed while fetching, revoking the just-created object URL.
   */
  private async loadImage(section: HTMLDivElement): Promise<void> {
    let objectUrl: string | null = null;
    try {
      const response = await requestUrl({ url: this.imageUrl });
      const mimeType =
        response.headers["content-type"] ?? "application/octet-stream";
      const blob = new Blob([response.arrayBuffer], { type: mimeType });
      objectUrl = URL.createObjectURL(blob);
    } catch (error) {
      log.debug("No preview image for system:", this.imageUrl, error);
      return;
    }
    if (this.disposed) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
    this.objectUrl = objectUrl;
    section.createEl("h3", { text: t("community_system_preview") });
    const container = section.createDiv({ cls: c("flow-image-container") });
    const imgEl = container.createEl("img", {
      attr: { src: objectUrl, alt: t("community_system_preview") },
    });
    imgEl.addClass(c("flow-image-fit"));
  }

  /**
   * Validates the fetched (remote, untrusted) system, then writes every planned file (canvas first,
   * then each step), opens the canvas, and closes the modal. Idempotent by way of
   * {@link FileService.writeFile} (overwrite-in-place).
   */
  private async installSystem(): Promise<void> {
    const problems = validateSystemTemplate(this.template, REGISTERED_ACTION_IDS);
    if (problems.length > 0) {
      log.error("Refusing to install invalid community system:", problems);
      new Notice(t("community_system_install_error"));
      return;
    }
    try {
      const { files } = planSystemInstall(this.template, this.targetFolder);
      for (const file of files) {
        await FileService.writeFile(file.path, file.content, false);
      }
      this.close();
      if (files.length > 0) {
        // Open the canvas and offer to run it immediately — so a system is usable the moment it lands,
        // without wiring it into settings as the single ribbonCanvas (#231 / user feedback).
        await FileService.openFile(files[0].path);
      }
      this.notifyInstalled();
    } catch (error) {
      log.error("Error installing community system:", error);
      new Notice(t("community_system_install_error"));
    }
  }

  /** Success notice with a "Run now" button that runs the just-opened canvas as a flow. */
  private notifyInstalled(): void {
    const notice = new Notice("", 0);
    const message = notice.messageEl.createDiv();
    message.createSpan({ text: `${this.template.name} — ${t("community_system_installed")}` });
    message.createEl("br");
    const run = message.createEl("button", { text: t("community_system_run_now") });
    run.addClass("mod-cta");
    run.addEventListener("click", () => {
      ObsidianApi.executeCommandById(`${this.plugin.manifest.id}:run-canvas-flow`);
      notice.hide();
    });
  }

  onClose(): void {
    this.disposed = true;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.contentEl.empty();
  }
}

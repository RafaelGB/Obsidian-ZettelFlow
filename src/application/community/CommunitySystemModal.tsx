import { ButtonComponent, Modal, Notice, Setting, requestUrl } from "obsidian";
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
  executableCodeSites,
  REGISTERED_ACTION_IDS,
} from "./systemInstall";
import { COMMUNITY_BASE_URL } from "./services/CommunityHttpClientService";
import { installDestination, type InstallRole } from "./installDestination";
import { flowFolders, FLOW_ROLE_LABEL_KEY } from "architecture/plugin/canvas/flowRole";
import { ConfirmModal } from "architecture/components/settings";
import { SystemRehearsalPanel } from "./SystemRehearsalPanel";

type LocaleKey = Parameters<typeof t>[0];

/** The five answers to "how will you use this?", in the order the dialog offers them. */
const INSTALL_ROLES: InstallRole[] = ["create", "edit", "folder", "event", "none"];

/** How the system will run once installed — said in the user's terms, not as a command id. */
const RUNS_KEY: Record<InstallRole, string> = {
    create: "community_system_runs_create",
    edit: "community_system_runs_edit",
    folder: "community_system_runs_folder",
    event: "community_system_runs_event",
    none: "community_system_runs_none",
};

/** The role label, plus the one for "just the files" which is not a role at all. */
const ROLE_OPTION_KEY: Record<InstallRole, string> = {
    create: FLOW_ROLE_LABEL_KEY.create,
    edit: FLOW_ROLE_LABEL_KEY.edit,
    folder: FLOW_ROLE_LABEL_KEY.folder,
    event: FLOW_ROLE_LABEL_KEY.event,
    none: "community_system_role_none",
};

/**
 * Modal for a community **system** (#214): a `.zftemplate` bundle installed as a canvas + step notes
 * in one click. Consumes the unified `.zftemplate` format and writes real files through
 * {@link FileService.createFilesOnce} (no clipboard-paste dance or customized-file overwrite).
 */
export class CommunitySystemModal extends Modal {
  private installing = false;
  private installButton: ButtonComponent | null = null;
  private installStatus: HTMLElement | null = null;
  private targetFolder: string;
  private imageUrl = `${COMMUNITY_BASE_URL}${this.refUrl.replace(
    /\.zftemplate$/,
    ".png"
  )}`;
  private objectUrl: string | null = null;
  /** Set in `onClose`; guards the async image load against a close-before-fetch race. */
  private disposed = false;
  /**
   * Whether the user has acknowledged that this system ships runnable code. Starts `true` for the
   * systems that carry none, so nothing gains friction where there is nothing to disclose (#353).
   */
  private codeAcknowledged = true;
  /**
   * How the system will be used (#437). Pre-selected as *creates notes* **only** when no canvas
   * holds that role yet — the common first install, where nothing is displaced. Otherwise it
   * starts at "just the files", so the question never has a destructive default.
   */
  private role: InstallRole;
  /** For the folder role: the vault folder whose notes should run it. */
  private roleFolder = "";
  /** Whether the rehearsal panel is open (#438). It writes nothing, so it can stay inline. */
  private trying = false;

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
    this.role = plugin.settings.ribbonCanvas ? "none" : "create";
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

    // --- Executable code disclosure (#353) ---
    // Systems are remote content installed in one click, and `script` is a legitimate action — so the
    // install must say that code comes with it, not refuse it.
    const codeSites = executableCodeSites(this.template);
    if (codeSites.length > 0) {
      this.codeAcknowledged = false;
      const codeSection = this.contentEl.createDiv({
        cls: c("system-code-disclosure"),
      });
      codeSection.createEl("h3", { text: t("community_system_code_heading") });
      codeSection.createEl("p", { text: t("community_system_code_desc") });
      const codeList = codeSection.createEl("ul", { cls: c("flow-nodes-list") });
      for (const site of codeSites) {
        codeList.createEl("li", {
          text: `${site.filename} — ${site.actionType}`,
        });
      }
    }

    // --- How will you use this? (#437) ---
    // The last question stops being *where do the files go* and becomes *what is this for*: the
    // role writes the setting or picks the folder that makes the system reachable at all.
    new Setting(this.contentEl)
      .setName(t("community_system_role"))
      .setDesc(t("community_system_role_desc"))
      .addDropdown((dropdown) => {
        for (const role of INSTALL_ROLES) {
          dropdown.addOption(role, t(ROLE_OPTION_KEY[role] as LocaleKey));
        }
        dropdown.setValue(this.role).onChange((value) => {
          this.role = value as InstallRole;
          this.contentEl.empty();
          this.renderContent();
        });
      });

    if (this.role === "folder") {
      new Setting(this.contentEl)
        .setName(t("assign_role_folder"))
        .setDesc(t("assign_role_folder_description"))
        .addSearch((cb) => {
          new FolderSuggest(cb.inputEl);
          cb.setValue(this.roleFolder).onChange((value) => {
            this.roleFolder = value;
          });
        });
    }

    // --- Install location (the role decides it for a folder or event flow) ---
    if (this.role === "none" || this.role === "create" || this.role === "edit") {
      new Setting(this.contentEl)
        .setName(t("community_system_install_location"))
        .setDesc(t("community_system_install_location_desc"))
        .addSearch((cb) => {
          new FolderSuggest(cb.inputEl);
          cb.setValue(this.targetFolder).onChange((value) => {
            if (!this.installing) this.targetFolder = value;
          });
        });
    }

    // --- Acknowledgement, then the install button it unlocks ---
    // Built in that order because a Setting appends to contentEl as it is constructed: creating the
    // acknowledgement inside the button's callback put the toggle *below* the button it gates.
    let installButton: ButtonComponent | null = null;

    if (!this.codeAcknowledged) {
      new Setting(this.contentEl)
        .setName(t("community_system_code_ack"))
        .addToggle((toggle) => {
          toggle.setValue(false).onChange((value) => {
            this.codeAcknowledged = value;
            installButton?.setDisabled(!value);
          });
        });
    }

    // --- Try it first (#438): the walk and the review, before a single file exists ---
    new Setting(this.contentEl)
      .setName(t("community_system_try"))
      .setDesc(t("community_system_try_desc"))
      .addButton((btn) =>
        btn.setButtonText(t("community_system_try_button")).onClick(() => {
          this.trying = !this.trying;
          this.contentEl.empty();
          this.renderContent();
        })
      );

    if (this.trying) {
      const panel = this.contentEl.createDiv({ cls: c("system-rehearsal") });
      new SystemRehearsalPanel(this.template, panel).render();
    }

    new Setting(this.contentEl).addButton((btn) => {
      installButton = btn;
      this.installButton = btn;
      btn
        .setButtonText(t("community_system_install_button"))
        .setCta()
        .setDisabled(!this.codeAcknowledged)
        .onClick(() => {
          void this.installSystem();
        });
    });
    this.installStatus = this.contentEl.createDiv({ attr: { role: 'status', 'aria-live': 'polite' } });
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
  * {@link FileService.createFilesOnce}: exact retries are safe, customized files are preserved.
   */
  private async installSystem(): Promise<void> {
    if (this.installing || !this.codeAcknowledged) return;
    const problems = validateSystemTemplate(this.template, REGISTERED_ACTION_IDS);
    if (problems.length > 0) {
      log.error("Refusing to install invalid community system:", problems);
      new Notice(t("community_system_install_error"));
      return;
    }
    // Where it lands and what it changes, before anything exists (#437).
    const destination = installDestination({
      role: this.role,
      targetFolder: this.targetFolder,
      canvasFilename: this.template.canvas.filename,
      folders: flowFolders(this.plugin.settings),
      folder: this.roleFolder,
    });
    if (destination.problem) {
      const message =
        destination.problem === "folder-required"
          ? t("assign_role_problem_folder_required")
          : t("assign_role_problem_no_home");
      this.installStatus?.setText(message);
      new Notice(message);
      return;
    }

    // Cancelling here writes nothing at all — not the files either: the role is part of the
    // install, not a follow-up to it (AC-2).
    const details = [
      t("community_system_install_into", destination.targetFolder),
      ...(destination.displaces ? [t("assign_role_displaces", destination.displaces)] : []),
      t(RUNS_KEY[this.role] as LocaleKey),
    ];
    new ConfirmModal(
      this.app,
      t("community_system_confirm"),
      t("community_system_install_button"),
      t("confirm_cancel_button"),
      async () => this.writeSystem(destination),
      details
    ).open();
  }

  /** The write half, once it has been agreed to. */
  private async writeSystem(
    destination: ReturnType<typeof installDestination>
  ): Promise<void> {
    try {
      this.installing = true; this.installButton?.setDisabled(true);
      this.installStatus?.setText(t('community_system_installing'));
      const { files } = planSystemInstall(this.template, destination.targetFolder);
      // A folder flow is found by its name, so the convention renames the canvas (#437).
      if (destination.canvasName && files.length > 0) {
        files[0] = { ...files[0], path: `${destination.targetFolder}/${destination.canvasName}` };
      }
      const result = await FileService.createFilesOnce(this.app.vault, files);
      if (result !== 'complete') {
        const message = t(result === 'conflict' ? 'community_system_install_conflict' : 'community_system_install_partial');
        this.installStatus?.setText(message); new Notice(message);
        this.installButton?.setButtonText(t('community_system_install_retry'));
        return;
      }
      // The role's one setting, written only now that its files exist.
      if (destination.settings) {
        this.plugin.settings[destination.settings.key] = destination.settings.value;
        await this.plugin.saveSettings();
      }
      if (this.disposed) return;
      this.close();
      if (files.length > 0) {
        await FileService.openFile(files[0].path);
      }
      this.notifyInstalled();
    } catch {
      log.error("Community system installation failed");
      new Notice(t("community_system_install_error"));
    } finally {
      this.installing = false; this.installButton?.setDisabled(!this.codeAcknowledged);
    }
  }

  /**
   * Success notice that says **how it runs now** (#437 FR-6). A command id told you nothing about
   * what you had just installed; the role does — and *just the files* still offers to run it.
   */
  private notifyInstalled(): void {
    const notice = new Notice("", 0);
    const message = notice.messageEl.createDiv();
    message.createSpan({ text: `${this.template.name} — ${t("community_system_installed")}` });
    message.createEl("br");
    message.createSpan({ text: t(RUNS_KEY[this.role] as LocaleKey) });
    if (this.role !== "none") return;
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

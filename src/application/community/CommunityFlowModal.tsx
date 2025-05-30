import { Component, Modal, Notice, requestUrl, setIcon } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { FileService, MarkdownService } from "architecture/plugin";
import ZettelFlow from "main";
import { CommunityFlowData, CommunityFlowNode } from "./typing";
import { CommunityStepSettings } from "config";
import { actionsStore } from "architecture/api";
import { getCanvasColor } from "architecture/plugin/canvas/shared/Color";
import {
  COMMUNITY_BASE_URL,
  fetchMarkdownTemplate,
} from "./services/CommunityHttpClientService";

/**
 * Modal to display community flow previews, metadata, nodes, and connections.
 */
export class CommunityFlowModal extends Modal {
  private nodesRef: Record<string, string> = {};
  private isImageExpanded = false;
  private imageUrl = `${COMMUNITY_BASE_URL}${this.refUrl}/image.png`;
  private objectUrl: string | null = null;
  private filesToDownload: Record<string, string> = {};
  private downloadMdButton: HTMLButtonElement;
  constructor(
    private plugin: ZettelFlow,
    private flow: CommunityFlowData,
    private refUrl: string,
    private onInstallToggle: () => void
  ) {
    super(plugin.app);
  }

  /**
   * When the modal opens, apply styles and render content.
   */
  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    this.renderContent();
  }

  /**
   * Fetches flow image as ArrayBuffer, converts to Blob URL.
   * @returns Blob URL string or null on failure.
   */
  private async fetchFlowImage(): Promise<string | null> {
    try {
      const response = await requestUrl({ url: this.imageUrl });
      const buffer = response.arrayBuffer;
      const mimeType =
        response.headers["content-type"] ?? "application/octet-stream";
      const blob = new Blob([buffer], { type: mimeType });
      this.objectUrl = URL.createObjectURL(blob);
      return this.objectUrl;
    } catch (error) {
      console.error("Error fetching flow image:", error);
      return null;
    }
  }

  /**
   * Renders the modal content: header, description, image, nodes, and edges.
   */
  private async renderContent(): Promise<void> {
    this.contentEl.empty();

    // --- Header with Title and Install/Remove Button ---
    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });
    navbar.createEl("h2", { text: this.flow.title });

    const buttonGroup = navbar.createDiv({ cls: c("navbar-button-group") });
    const btnText = t("copy_to_clipboard_button");

    const actionBtn = buttonGroup.createEl("button", {
      text: btnText,
      title: btnText,
    });
    actionBtn.addClass("mod-cta");
    actionBtn.addEventListener("click", () => {
      this.plugin.settings.communitySettings.clipboardTemplate = this.flow;
      this.plugin.saveSettings();
      actionBtn.setText(t("template_copied"));
      actionBtn.setAttribute("aria-disabled", "true");
      actionBtn.setAttribute("disabled", "true");
      setTimeout(() => {
        actionBtn.setText(btnText);
        actionBtn.removeAttribute("aria-disabled");
        actionBtn.removeAttribute("disabled");
      }, 3000);
      new Notice(`${this.flow.title} ${t("template_copied_to_clipboard")}`);
      this.onInstallToggle();
    });

    // --- Download Files Section ---
    this.downloadMdButton = buttonGroup.createEl(
      "button",
      {
        placeholder: t("template_download_flow_files"),
        title: t("template_download_flow_title"),
      },
      (el) => {
        el.addClass("mod-cta");
        el.addEventListener("click", async () => {
          Object.entries(this.filesToDownload).forEach(
            async ([filename, content]) => {
              const path = `${this.plugin.settings.communitySettings.markdownTemplateFolder}/${filename}`;
              // Delete existing file if it exists
              const potentialFile = await FileService.getFile(path, false);
              if (potentialFile) {
                await FileService.deleteFile(potentialFile);
              }

              await FileService.createFile(
                `${this.plugin.settings.communitySettings.markdownTemplateFolder}/${filename}`,
                content,
                false
              );
            }
          );
          new Notice(
            `${t("template_files_downloaded")} ${this.flow.title} ${t(
              "template_files_downloaded_notice"
            ).replace(
              "{{count}}",
              Object.keys(this.filesToDownload).length.toString()
            )}`
          );
        });
      }
    );
    setIcon(this.downloadMdButton.createDiv(), "download");
    this.downloadMdButton.style.display = "none";

    // --- Description Section ---
    const infoSection = this.contentEl.createDiv({
      cls: c("modal-reader-general-section"),
    });
    const md = `**${t("template_author")}**: ${this.flow.author}

---

${this.flow.description}`;

    MarkdownService.render(
      this.plugin.app,
      md,
      infoSection,
      "/",
      new Component()
    );

    // --- Image Preview Section ---
    const imgUrl = await this.fetchFlowImage();
    if (imgUrl) {
      const imgSection = this.contentEl.createDiv({
        cls: c("modal-reader-flow-image-section"),
      });
      imgSection.createEl("h3", { text: "Flow Preview" });

      const container = imgSection.createDiv({
        cls: c("flow-image-container"),
      });
      const imgEl = container.createEl("img", {
        attr: { src: imgUrl, alt: `${this.flow.title} preview` },
      });

      // Ensure image fits within modal
      imgEl.style.maxWidth = "100%";
      imgEl.style.height = "auto";

      imgEl.addEventListener("click", () => {
        this.isImageExpanded = !this.isImageExpanded;
        imgEl.toggleClass(c("flow-image-expanded"), this.isImageExpanded);
      });
    }

    // --- Nodes Section ---
    this.renderNodesSection();

    // --- Edges Section ---
    this.renderEdgesSection();
  }

  /**
   * Renders a collapsible list of flow nodes grouped by type.
   */
  private renderNodesSection(): void {
    const section = this.contentEl.createDiv({
      cls: c("modal-reader-flow-nodes-section"),
    });
    section.createEl("h3", { text: "Flow Nodes" });

    const container = section.createDiv({ cls: c("flow-nodes-container") });
    const grouped: Record<string, CommunityFlowNode[]> = {};
    this.flow.nodes.forEach((node, index) => {
      node.index = index;
      (grouped[node.type] ||= []).push(node);
    });

    for (const [type, nodes] of Object.entries(grouped)) {
      const typeBlock = container.createDiv({
        cls: c("flow-node-type-section"),
      });
      typeBlock.createEl("h4", {
        text: `${type.charAt(0).toUpperCase() + type.slice(1)} Nodes (${
          nodes.length
        })`,
      });

      const list = typeBlock.createEl("ul", { cls: c("flow-nodes-list") });
      nodes.forEach((node, index) => {
        this.nodesRef[node.id] = `${type}(${index})`;
        const item = list.createEl("li", { cls: c("flow-node-item") });

        // Create accordion header
        const accordionHeader = item.createDiv({
          cls: c("flow-node-accordion-header"),
        });

        // Add node title/label to header
        const nodeTitle =
          node.text ||
          node.label ||
          node.file ||
          `Node ${node.id.substring(0, 6)}...`;
        accordionHeader.createEl("span", {
          text: `${this.nodesRef[node.id]} - ${nodeTitle}`,
          cls: c("flow-node-title"),
        });

        // Add color badge if node has a color
        if (node.color) {
          accordionHeader.style.borderLeft = `4px solid rgb(${getCanvasColor(
            node.color
          )})`;
        }

        // Add toggle indicator
        const toggleIndicator = accordionHeader.createSpan({
          cls: c("flow-node-toggle"),
        });
        toggleIndicator.setText("▶");

        // Create accordion content (initially hidden)
        const accordionContent = item.createDiv({
          cls: c("flow-node-accordion-content"),
        });
        accordionContent.style.display = "none";

        switch (type) {
          case "text":
          case "group":
            this.renderNodeItem(accordionContent, node, nodeTitle);
            break;
          case "file":
            this.renderFileNodeItem(accordionContent, node);
            break;
        }
        // Add click event to toggle accordion
        accordionHeader.addEventListener("click", () => {
          const isExpanded = accordionContent.style.display !== "none";
          accordionContent.style.display = isExpanded ? "none" : "block";
          toggleIndicator.setText(isExpanded ? "▶" : "▼");
          accordionHeader.toggleClass(c("expanded"), !isExpanded);
        });
      });
    }
  }

  private async renderFileNodeItem(
    accordionContent: HTMLDivElement,
    node: CommunityFlowNode
  ): Promise<void> {
    const filename = node.file as string;
    const fileContent = await fetchMarkdownTemplate(
      `${this.refUrl}/${filename}`
    );
    this.filesToDownload[filename] = fileContent;

    const comp = new Component();
    const mdContent = accordionContent.createDiv({
      cls: c("markdown-content"),
    });
    MarkdownService.render(this.app, fileContent, mdContent, "/", comp);
    this.enableDownloadButton();

    console.log("fileContent", fileContent);
    this.flow.nodes[
      node.index
    ].file = `${this.plugin.settings.communitySettings.markdownTemplateFolder}/${filename}`;
  }

  private renderNodeItem(
    accordionContent: HTMLDivElement,
    node: CommunityFlowNode,
    nodeTitle: string
  ): void {
    // Add node text if it exists and is different from the title
    if (node.text && node.text !== nodeTitle) {
      const textSection = accordionContent.createDiv({
        cls: c("flow-node-text"),
      });
      textSection.createEl("div", { text: node.text });
    }

    // Add actions section only if actions exist
    if (node.zettelflowConfig) {
      try {
        const zettelflowConfig = JSON.parse(
          node.zettelflowConfig
        ) as CommunityStepSettings;

        // Target folder
        const mdContent = `**${t("template_target_folder")}**: ${
          zettelflowConfig.targetFolder
        }
            **${t("template_optional")}**: ${
          zettelflowConfig.optional ? t("template_yes") : t("template_no")
        }
            **${t("template_root")}**: ${
          zettelflowConfig.root ? t("template_yes") : t("template_no")
        }`;

        const comp = new Component();
        const descriptionSection = accordionContent.createDiv({
          cls: c("modal-reader-general-section"),
        });

        MarkdownService.render(
          this.plugin.app,
          mdContent,
          descriptionSection,
          "/",
          comp,
          [c("modal-reader-markdown-preview")]
        );

        if (zettelflowConfig.actions && zettelflowConfig.actions.length > 0) {
          const actionsSection = accordionContent.createDiv({
            cls: c("flow-node-actions"),
          });
          actionsSection.createEl("h5", { text: t("template_actions") });

          zettelflowConfig.actions.forEach((action) => {
            const actionEl = actionsSection.createDiv({
              cls: c("modal-reader-action-section"),
            });
            const currentAction = actionsStore.getAction(action.type);
            actionEl.createEl("p", {
              text: `${t("template_type")}: ${currentAction.getLabel()}`,
            });
            actionEl.createEl("p", {
              text: `${t("action_description_label")}: ${action.description}`,
            });
            setIcon(actionEl.createDiv(), currentAction.getIcon());
            const settingsSection = actionsSection.createDiv({
              cls: c("modal-reader-section"),
            });
            currentAction.settingsReader(settingsSection, action);
          });
        }
      } catch (error) {
        console.error("Error parsing zettelflowConfig:", error);
      }
    }
  }
  /**
   * Renders a list of flow edges with source → target.
   */
  private renderEdgesSection(): void {
    if (!this.flow.edges?.length) return;

    const section = this.contentEl.createDiv({
      cls: c("modal-reader-flow-edges-section"),
    });
    section.createEl("h3", { text: "Flow Connections" });
    const list = section
      .createDiv({ cls: c("flow-edges-container") })
      .createEl("ul", { cls: c("flow-edges-list") });

    this.flow.edges.forEach((edge) => {
      const item = list.createEl("li", { cls: c("flow-edge-item") });
      const label = `${this.nodesRef[edge.fromNode]} → ${
        this.nodesRef[edge.toNode]
      }${edge.label ? ` | Label: "${edge.label}"` : ""}`;

      const header = item.createDiv({ cls: c("flow-edge-header") });
      header.createEl("span", {
        text: label,
      });
      if (edge.color) {
        header.style.borderLeft = `4px solid rgb(${getCanvasColor(
          edge.color
        )})`;
      }
    });
  }

  /**
   * Cleanup resources when the modal is closed.
   */
  onClose(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.contentEl.empty();
  }

  private enableDownloadButton(): void {
    this.downloadMdButton.style.display = "block";
  }
}

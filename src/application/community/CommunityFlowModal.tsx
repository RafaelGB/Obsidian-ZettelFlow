import { Component, Modal, requestUrl, setIcon } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { MarkdownService } from "architecture/plugin";
import ZettelFlow from "main";

// --- Type Definitions for Flow Data Structures ---
interface FlowNode {
  id: string;
  type: string;
  styleAttributes: Record<string, unknown>;
  zettelflowConfig?: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  label?: string;
}

interface FlowEdge {
  id: string;
  fromNode: string;
  fromSide: string;
  toNode: string;
  toSide: string;
  color?: string;
  label?: string;
}

interface FlowData {
  title: string;
  description: string;
  template_type: string;
  author: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/**
 * Modal to display community flow previews, metadata, nodes, and connections.
 */
export class CommunityFlowModal extends Modal {
  private isImageExpanded = false;
  private objectUrl: string | null = null;

  constructor(
    private plugin: ZettelFlow,
    private flow: FlowData,
    private imageUrl: string,
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
    const installed = false; // TODO: determine actual install state
    const btnText = installed ? t("remove_button") : t("install_button");

    const actionBtn = buttonGroup.createEl("button", {
      text: btnText,
      title: btnText,
    });
    actionBtn.addClass("mod-cta");
    actionBtn.addEventListener("click", () => {
      this.onInstallToggle();
      this.renderContent();
    });

    // --- Description Section ---
    const infoSection = this.contentEl.createDiv({
      cls: c("modal-reader-general-section"),
    });
    const md = `**${t("template_author")}**: ${this.flow.author}\n\n---\n\n${
      this.flow.description
    }`;
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
    const grouped: Record<string, FlowNode[]> = {};
    this.flow.nodes.forEach((node) => {
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
      nodes.forEach((node) => {
        const item = list.createEl("li", { cls: c("flow-node-item") });
        const header = item.createDiv({ cls: c("flow-node-header") });
        const title = node.label ?? node.text?.slice(0, 30) ?? node.id;
        header.createEl("span", { text: title });
        const icon = header.createDiv({ cls: c("flow-node-expand-icon") });
        setIcon(icon, "chevron-down");

        const content = item.createDiv({
          cls: `${c("flow-node-content")} is-collapsed`,
        });
        header.addEventListener("click", () => {
          content.toggleClass(
            "is-collapsed",
            !content.hasClass("is-collapsed")
          );
          setIcon(
            icon,
            content.hasClass("is-collapsed") ? "chevron-down" : "chevron-up"
          );
        });

        const details = content.createEl("ul", { cls: c("flow-node-details") });
        details.createEl("li", { text: `ID: ${node.id}` });
        details.createEl("li", { text: `Position: x=${node.x}, y=${node.y}` });
        details.createEl("li", { text: `Size: ${node.width}×${node.height}` });
        if (node.color)
          details.createEl("li", { text: `Color: ${node.color}` });
        if (node.zettelflowConfig) {
          const configItem = details.createEl("li");
          configItem.createEl("span", { text: "ZettelFlow Config:" });
          configItem
            .createEl("pre", { cls: c("flow-node-config") })
            .createEl("code", { text: node.zettelflowConfig });
        }
      });
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
      const from = this.flow.nodes.find((n) => n.id === edge.fromNode);
      const to = this.flow.nodes.find((n) => n.id === edge.toNode);
      const label = `${from?.label ?? edge.fromNode} → ${
        to?.label ?? edge.toNode
      }`;

      const header = item.createDiv({ cls: c("flow-edge-header") });
      header.createEl("span", {
        text: label + (edge.label ? ` (${edge.label})` : ""),
      });
      if (edge.color)
        header.createEl("span", {
          cls: c("flow-edge-color-badge"),
        }).style.backgroundColor = edge.color;
    });
  }

  /**
   * Cleanup resources when the modal is closed.
   */
  onClose(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.contentEl.empty();
  }
}

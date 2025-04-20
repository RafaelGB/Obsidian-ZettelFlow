import { c } from "architecture";
import { t } from "architecture/lang";
import { MarkdownService } from "architecture/plugin";
import ZettelFlow from "main";
import { Component, Modal, requestUrl, setIcon } from "obsidian";

// Define Flow type for better type safety
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

export class CommunityFlowModal extends Modal {
  private isImageExpanded: boolean = false;
  constructor(
    private plugin: ZettelFlow,
    private flow: FlowData,
    private imageUrl: string,
    private callback: () => void
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass(c("modal"));
    this.renderContent();
  }

  private async fetchFlowImage(): Promise<string | null> {
    try {
      // Step 1: Fetch the image data
      const response = await requestUrl({
        url: this.imageUrl,
      });
      const buffer = response.arrayBuffer; // ArrayBuffer puro :contentReference[oaicite:0]{index=0}

      // Step 2: Convert the ArrayBuffer to a Blob
      const contentType =
        response.headers["content-type"] ?? "application/octet-stream";
      const blob = new Blob([buffer], { type: contentType });

      // Step 3: Create a URL for the Blob
      const objectUrl = URL.createObjectURL(blob);

      return objectUrl;
    } catch (error) {
      console.error("Error fetching flow image:", error);
      return null;
    }
  }

  private async renderContent() {
    // Clear the previous content
    this.contentEl.empty();

    // Header with title and subtitle with the mode
    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });

    navbar.createEl("h2", { text: this.flow.title });

    const navbarButtonGroup = navbar.createDiv({
      cls: c("navbar-button-group"),
    });

    // Check if the flow is already installed
    const isInstalled = false;
    const buttonTitle = isInstalled ? t("remove_button") : t("install_button");

    // Add a button to install/uninstall
    navbarButtonGroup.createEl(
      "button",
      {
        placeholder: buttonTitle,
        title: buttonTitle,
        text: buttonTitle,
      },
      (el) => {
        el.addClass("mod-cta");
        el.addEventListener("click", async () => {
          // TODO: install/uninstall flow
          console.log("Installing flow...");
          this.callback();
          this.renderContent();
        });
      }
    );

    // General info section
    const generalInfoEl = this.contentEl.createDiv({
      cls: c("modal-reader-general-section"),
    });
    const descriptionEl = generalInfoEl.createDiv();

    // Format markdown content with author and description
    const mdContent = `**${t("template_author")}**: ${this.flow.author}
    
---

${this.flow.description}`;

    const comp = new Component();
    MarkdownService.render(
      this.plugin.app,
      mdContent,
      descriptionEl,
      "/",
      comp
    );

    // Image preview section
    const blobImage = await this.fetchFlowImage();
    if (!blobImage) return;

    const imageSection = this.contentEl.createDiv({
      cls: c("modal-reader-flow-image-section"),
    });

    imageSection.createEl("h3", {
      // TODO: add lang translation
      text: "Flow Preview",
    });

    const imageContainer = imageSection.createDiv({
      cls: c("flow-image-container"),
    });

    const imageElement = imageContainer.createEl("img", {
      attr: {
        src: blobImage,
        alt: `${this.flow.title} preview`,
      },
    });

    imageElement.onclick = () => {
      this.isImageExpanded = !this.isImageExpanded;
      if (this.isImageExpanded) {
        imageElement.addClass(c("flow-image-expanded"));
      } else {
        imageElement.removeClass(c("flow-image-expanded"));
      }
    };

    // Nodes and Edges Section
    // Nodes Section
    this.renderNodesSection();

    // Edges Section
    this.renderEdgesSection();
  }

  private renderNodesSection() {
    const nodesSection = this.contentEl.createDiv({
      cls: c("modal-reader-flow-nodes-section"),
    });
    // TODO: add lang translation
    nodesSection.createEl("h3", { text: "Flow Nodes" });

    const nodesContainer = nodesSection.createDiv({
      cls: c("flow-nodes-container"),
    });

    // Group nodes by type for better organization
    const nodesByType: Record<string, FlowNode[]> = {};
    this.flow.nodes.forEach((node) => {
      if (!nodesByType[node.type]) {
        nodesByType[node.type] = [];
      }
      nodesByType[node.type].push(node);
    });

    // Render nodes by type
    Object.entries(nodesByType).forEach(([type, nodes]) => {
      const typeSection = nodesContainer.createDiv({
        cls: c("flow-node-type-section"),
      });

      typeSection.createEl("h4", {
        text: `${type.charAt(0).toUpperCase() + type.slice(1)} Nodes (${
          nodes.length
        })`,
      });

      const nodesList = typeSection.createEl("ul", {
        cls: c("flow-nodes-list"),
      });

      nodes.forEach((node) => {
        const nodeItem = nodesList.createEl("li", {
          cls: c("flow-node-item"),
        });

        // Node header for accordion effect
        const nodeHeader = nodeItem.createDiv({
          cls: c("flow-node-header"),
        });

        // Display node label or text as the main identifier
        const nodeTitle =
          node.label ||
          (node.text
            ? node.text.substring(0, 30) + (node.text.length > 30 ? "..." : "")
            : `Node ${node.id}`);
        nodeHeader.createEl("span", { text: nodeTitle });

        // Expand/collapse icon
        const expandIcon = nodeHeader.createDiv({
          cls: c("flow-node-expand-icon"),
        });
        setIcon(expandIcon, "chevron-down");

        // Node content (initially hidden)
        const nodeContent = nodeItem.createDiv({
          cls: c("flow-node-content", "is-collapsed"),
        });

        // Toggle visibility on click
        nodeHeader.onclick = () => {
          if (nodeContent.hasClass("is-collapsed")) {
            nodeContent.removeClass("is-collapsed");
            setIcon(expandIcon, "chevron-up");
          } else {
            nodeContent.addClass("is-collapsed");
            setIcon(expandIcon, "chevron-down");
          }
        };

        // Render node details
        const detailsList = nodeContent.createEl("ul", {
          cls: c("flow-node-details"),
        });

        // Add ID
        detailsList.createEl("li", { text: `ID: ${node.id}` });

        // Add position
        detailsList.createEl("li", {
          text: `Position: x=${node.x}, y=${node.y}`,
        });

        // Add size
        detailsList.createEl("li", {
          text: `Size: ${node.width}×${node.height}`,
        });

        // Add color if available
        if (node.color) {
          detailsList.createEl("li", { text: `Color: ${node.color}` });
        }

        // Add ZettelFlow config if available
        if (node.zettelflowConfig) {
          const configItem = detailsList.createEl("li");
          configItem.createEl("span", { text: "ZettelFlow Config:" });

          const configCode = configItem.createEl("pre", {
            cls: c("flow-node-config"),
          });
          configCode.createEl("code", { text: node.zettelflowConfig });
        }
      });
    });
  }

  private renderEdgesSection() {
    // Skip if no edges
    if (!this.flow.edges || this.flow.edges.length === 0) return;

    const edgesSection = this.contentEl.createDiv({
      cls: c("modal-reader-flow-edges-section"),
    });

    edgesSection.createEl("h3", {
      // TODO: add lang translation
      text: "Flow Connections",
    });

    const edgesContainer = edgesSection.createDiv({
      cls: c("flow-edges-container"),
    });

    const edgesList = edgesContainer.createEl("ul", {
      cls: c("flow-edges-list"),
    });

    this.flow.edges.forEach((edge) => {
      const edgeItem = edgesList.createEl("li", {
        cls: c("flow-edge-item"),
      });

      // Find source and target node names
      const sourceNode = this.flow.nodes.find(
        (node) => node.id === edge.fromNode
      );
      const targetNode = this.flow.nodes.find(
        (node) => node.id === edge.toNode
      );

      const sourceName =
        sourceNode?.label ||
        sourceNode?.text?.substring(0, 20) ||
        edge.fromNode;
      const targetName =
        targetNode?.label || targetNode?.text?.substring(0, 20) || edge.toNode;

      // Edge header with basic information
      const edgeHeader = edgeItem.createEl("div", {
        cls: c("flow-edge-header"),
      });

      const connectionText = `${sourceName} → ${targetName}`;
      const edgeLabel = edge.label ? ` (${edge.label})` : "";

      edgeHeader.createEl("span", { text: `${connectionText}${edgeLabel}` });

      if (edge.color) {
        const colorBadge = edgeHeader.createEl("span", {
          cls: c("flow-edge-color-badge"),
        });
        colorBadge.style.backgroundColor = edge.color;
      }
    });
  }

  onClose(): void {
    // Cleanup the object URL when the modal is closed
    URL.revokeObjectURL(this.imageUrl);

    let { contentEl } = this;
    contentEl.empty();
  }
}

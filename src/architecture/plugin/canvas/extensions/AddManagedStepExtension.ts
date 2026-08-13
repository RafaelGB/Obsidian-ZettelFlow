import { AllCanvasNodeData, Canvas, CanvasEdgeData, CanvasNode, Position } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { CommunityFlowNode, UsedInstalledStepsModal } from "application/community";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { OptionsModal, Option } from "architecture/components/settings";
import { StepSettings } from "zettelkasten";
import { Notice } from "obsidian";
import { t } from "architecture/lang";
import { ObsidianApi, log } from "architecture";
import { FileService } from "architecture/plugin";

const GROUP_NODE_SIZE = { width: 300, height: 300 };
const TEXT_NODE_SIZE = { width: 300, height: 100 };
const FILE_NODE_SIZE = { width: 400, height: 400 };

/**
 * Extension that adds a managed step option to a ZettelFlow canvas.
 */
export default class AddManagedStepExtension extends CanvasExtension {
    /**
     * Indicates whether this extension is enabled.
     * @returns {boolean} Always true.
     */
    isEnabled(): boolean {
        return true;
    }

    /**
     * Initializes the extension by registering an event listener for the canvas drop menu.
     */
    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("zettelflow-node-connection-drop-menu", (canvas: Canvas) => {
                // Proceed only if the canvas is a ZettelFlow canvas.
                if (CanvasHelper.isCanvasFlow(this.plugin)) {
                    this.addManagedStepOption(canvas);
                    this.addClipboardOption(canvas);
                }
            })
        );
    }

    /**
     * Adds the "Import Flow Data from Clipboard" option to the canvas's card menu.
     *
     * @param {Canvas} canvas - The canvas to which the option is added.
     */
    private addClipboardOption(canvas: Canvas): void {
        const cardMenuOption = CanvasHelper.createCardMenuOption(
            canvas,
            {
                id: "import-flow-data",
                label: "Import flow data from clipboard",
                icon: "layout-template"
            },
            () => GROUP_NODE_SIZE,
            (canvas: Canvas, pos: Position) => this.importFlowData(canvas, pos)
        );

        CanvasHelper.addCardMenuOption(canvas, cardMenuOption);
    }

    /**
     * Imports flow data from the clipboard into the canvas.
     *
     * @param {Canvas} canvas - The canvas where the flow data will be imported.
     * @param {Position} pos - The position where the flow data will be placed.
     */
    private importFlowData(canvas: Canvas, pos: Position): void {
        const potentialData = this.plugin.settings.communitySettings.clipboardTemplate;
        if (!potentialData || potentialData.template_type !== "flow") {
            new Notice("You need to copy a flow template from the community browser to use this feature.");
            return;
        }
        const nodeData = potentialData.nodes.map((node: CommunityFlowNode) => {
            return this.modifyRelativePositionFromCenter(node, potentialData.center, pos);
        });
        canvas.importData({
            nodes: nodeData as AllCanvasNodeData[],
            edges: potentialData.edges as CanvasEdgeData[]
        });

        delete this.plugin.settings.communitySettings.clipboardTemplate;
        void this.plugin.saveSettings();
        new Notice("Flow data imported from clipboard!");
    }

    /**
     * Given a node with an absolute x and y position, modifies its position
     * to be relative to the center of the dropped flow.
     * 
     * @param {CommunityFlowNode} node The node to be modified
     * @param {Position} actualPos Center of the flow as was imported
     * @param {Position} targetPos Center of the node that was dropped
     * @returns 
     */
    private modifyRelativePositionFromCenter(node: CommunityFlowNode, actualPos: Position, targetPos: Position) {
        const xDiff = actualPos.x - targetPos.x;
        const yDiff = actualPos.y - targetPos.y;
        node.x = node.x - xDiff;
        node.y = node.y - yDiff;
        return node;
    }

    /**
     * Adds the "Create Managed Step" option to the canvas's card menu.
     *
     * @param {Canvas} canvas - The canvas to which the option is added.
     */
    private addManagedStepOption(canvas: Canvas): void {
        const cardMenuOption = CanvasHelper.createCardMenuOption(
            canvas,
            {
                id: "create-managed-step",
                label: "Create managed step",
                icon: RibbonIcon.ID
            },
            () => GROUP_NODE_SIZE,
            (canvas: Canvas, pos: Position) => this.handleManagedStepCreation(canvas, pos)
        );

        CanvasHelper.addCardMenuOption(canvas, cardMenuOption);
    }

    /**
     * Handles the managed step creation process by first prompting the user to select a step,
     * then presenting node creation options based on the chosen step.
     *
     * When no step templates are installed, skip the template picker and go directly to
     * the node-type selection with a blank step configuration so the canvas is never left
     * with an unusable empty modal.
     *
     * @param {Canvas} canvas - The canvas where the node will be created.
     * @param {Position} pos - The position at which to create the node.
     */
    private handleManagedStepCreation(canvas: Canvas, pos: Position): void {
        const installedSteps = this.plugin.settings.installedTemplates.steps;
        const openNodeTypeModal = (step: StepSettings) => {
            const options: Option[] = this.getCreationOptions(canvas, pos, step);
            new OptionsModal(this.plugin.app, "Type of Canvas component", options).open();
        };

        if (Object.keys(installedSteps).length > 0) {
            new UsedInstalledStepsModal(this.plugin, openNodeTypeModal).open();
        } else {
            openNodeTypeModal({ root: false, actions: [], label: "" });
        }
    }

    /**
     * Constructs the available options for node creation based on the selected step.
     *
     * @param {Canvas} canvas - The canvas where the node will be created.
     * @param {Position} pos - The position at which to create the node.
     * @param {StepSettings} step - The step selected by the user.
     * @returns {Option[]} An array of options for creating either a Text or Group node.
     */
    private getCreationOptions(canvas: Canvas, pos: Position, step: StepSettings): Option[] {
        // Legacy inline config: stamp the step JSON onto the canvas node's own data (text/group nodes).
        const saveStepConfig = (node: CanvasNode): void => {
            node.unknownData.zettelflowConfig = JSON.stringify(step);
        };

        return [
            {
                // Canonical format (#238): a real `.md` step file carrying `zettelFlowSettings`
                // frontmatter, referenced by a file node — the same format systems and export use, so
                // it is hot-reloadable and shareable. Offered first.
                label: t("managed_step_note_option"),
                onSelect: async () => {
                    await this.createFileStep(canvas, pos, step);
                }
            },
            {
                label: t("managed_step_text_option"),
                onSelect: async () => {
                    const node = canvas.createTextNode({
                        pos,
                        size: TEXT_NODE_SIZE,
                        text: step.label
                    });
                    saveStepConfig(node);
                }
            },
            {
                label: t("managed_step_group_option"),
                onSelect: async () => {
                    const node = canvas.createGroupNode({
                        pos,
                        size: GROUP_NODE_SIZE,
                        label: step.label
                    });
                    saveStepConfig(node);
                }
            }
        ];
    }

    /**
     * Create a step in the canonical **frontmatter** format (#238): write a `.md` file whose
     * `zettelFlowSettings` frontmatter is the step config, then place a file node pointing at it. This
     * is the format systems and `.zftemplate` export/import use — hot-reloadable (#226) and shareable —
     * unlike the legacy inline `zettelflowConfig` on a text/group node.
     */
    private async createFileStep(canvas: Canvas, pos: Position, step: StepSettings): Promise<void> {
        try {
            const folder = this.plugin.settings.foldersFlowsPath || "_ZettelFlow/folders";
            const base = (step.label?.trim() || "Step").replace(/[\\/:*?"<>|]/g, " ").trim() || "Step";
            let path = `${folder}/${base}.md`;
            for (let n = 2; await FileService.getFile(path, false); n++) {
                path = `${folder}/${base} ${n}.md`;
            }
            const file = await FileService.createFile(path, `# ${step.label || base}\n`, false);
            await ObsidianApi.fileManager().processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                frontmatter.zettelFlowSettings = step;
            });
            canvas.createFileNode({ pos, size: FILE_NODE_SIZE, file });
        } catch (error) {
            log.error("ZettelFlow: could not create a frontmatter step", error);
            new Notice(t("managed_step_note_error"));
        }
    }
}
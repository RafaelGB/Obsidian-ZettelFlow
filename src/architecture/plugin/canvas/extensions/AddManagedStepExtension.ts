import { Canvas, CanvasNode, Position } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { UsedInstalledStepsModal } from "application/community";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { OptionsModal, Option } from "architecture/components/settings";
import { StepSettings } from "zettelkasten";

const GROUP_NODE_SIZE = { width: 300, height: 300 };
const TEXT_NODE_SIZE = { width: 300, height: 100 };

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
                }
            })
        );
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
                label: "Create Managed Step",
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
     * @param {Canvas} canvas - The canvas where the node will be created.
     * @param {Position} pos - The position at which to create the node.
     */
    private handleManagedStepCreation(canvas: Canvas, pos: Position): void {
        new UsedInstalledStepsModal(this.plugin, (step) => {
            const options: Option[] = this.getCreationOptions(canvas, pos, step);
            new OptionsModal(this.plugin.app, "Type of Canvas component", options).open();
        }).open();
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
        // Helper function to save the step configuration in the node.
        const saveStepConfig = (node: CanvasNode): void => {
            node.unknownData.zettelflowConfig = JSON.stringify(step);
        };

        return [
            {
                label: "Text",
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
                label: "Group",
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
}
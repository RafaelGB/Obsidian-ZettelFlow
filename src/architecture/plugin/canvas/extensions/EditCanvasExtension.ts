import { Canvas, CanvasElement } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import { setIcon, setTooltip } from "obsidian";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { YamlService } from "architecture/plugin";
import { StepBuilderModal } from "zettelkasten";

interface MenuOption {
    id?: string;
    label: string;
    icon: string;
    callback?: () => void;
}

/**
 * This class extends Canvas functionality by adding a custom
 * "Edit ZettelFlow Step" button to the context (popup) menu when
 * exactly one node is selected.
 */
export default class EditStepCanvasExtension extends CanvasExtension {
    /**
     * Registers the "canvas:popup-menu" event listener. Whenever
     * the menu is about to be shown, this listener checks if it
     * should add a custom menu option for editing the selected node.
     */
    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("canvas:popup-menu", (canvas: Canvas) => {
                // Check if canvas is one of the ZettelFlow canvases
                const file = this.plugin.app.workspace.getActiveFile();
                if (!file) return;
                const { ribbonCanvas, editorCanvas, foldersFlowsPath } = this.plugin.settings;
                if (
                    ribbonCanvas !== file.path &&
                    editorCanvas !== file.path &&
                    !file.path.startsWith(foldersFlowsPath)
                ) {
                    return;
                }

                // The menu object from the Canvas
                const popupMenuEl = canvas?.menu?.menuEl;
                if (!popupMenuEl) return;

                // Only proceed if exactly one node is selected
                if (canvas.selection.size !== 1) return;

                // Get the first (and only) selected node
                const selectedNode: CanvasElement = canvas.selection.values().next().value;
                const data = selectedNode.getData();

                // Only generate icon if the node is text/group type (holds zettelflowConfig)
                if (data.type !== "text" && data.type !== "group") {
                    return;
                }
                // Define a unique ID for our new button to prevent duplication
                const buttonId = "edit-zettelflow-step-btn";

                // Create a new option
                const newOption = this.createPopupMenuOption({
                    id: buttonId,
                    label: "Edit ZettelFlow Step",
                    icon: RibbonIcon.ID,
                    callback: () => {
                        const builderMode = ribbonCanvas === file.path ? "ribbon" : "editor";
                        const zettelFlowSettings = data.zettelflowConfig;
                        const stepSettings = YamlService.instance(zettelFlowSettings).getZettelFlowSettings();

                        new StepBuilderModal(this.plugin.app, {
                            folder: file.parent || undefined,
                            filename: file.basename,
                            type: "text",
                            // Additional context for the modal
                            ...stepSettings,
                        })
                            .setMode("embed")
                            .setBuilder(builderMode)
                            .setNodeId(data.id)
                            .open();
                    },
                });

                // Add the new option to the popup menu, ensuring no duplicates
                this.addPopupMenuOption(canvas, newOption);
            })
        );
    }

    /**
     * Inserts the given menu option element into the popup menu if
     * it is not already present. If an element with the same 'id'
     * exists, it is removed first (so that there's never a duplicate).
     *
     * @param canvas The current Canvas instance.
     * @param element The HTML element to insert (the new button).
     * @param index The position at which to insert. Defaults to -1, meaning it inserts before the last item.
     */
    private addPopupMenuOption(canvas: Canvas, element: HTMLElement, index: number = -1): void {
        const popupMenuEl = canvas?.menu?.menuEl;
        if (!popupMenuEl) return;

        // If an element with this ID already exists, remove it
        if (element.id) {
            const existingOption = popupMenuEl.querySelector(`#${element.id}`);
            if (existingOption) {
                existingOption.remove();
            }
        }

        // Determine the insertion position
        const totalItems = popupMenuEl.children.length;
        const adjustedIndex = index >= 0 ? index : totalItems + index;
        const referenceItem = popupMenuEl.children[adjustedIndex];

        // Insert after the reference element
        popupMenuEl.insertAfter(element, referenceItem);
    }

    /**
     * Creates a menu option button with icon, tooltip, and click callback.
     *
     * @param menuOption Contains the label, icon, optional ID, and callback.
     * @returns The newly created HTML button element.
     */
    private createPopupMenuOption(menuOption: MenuOption): HTMLElement {
        const menuOptionElement = document.createElement("button");

        // Use the provided ID if present
        if (menuOption.id) {
            menuOptionElement.id = menuOption.id;
        }

        // Make it visually consistent with existing icons
        menuOptionElement.classList.add("clickable-icon");

        // Set icon and tooltip
        setIcon(menuOptionElement, menuOption.icon);
        setTooltip(menuOptionElement, menuOption.label, { placement: "top" });

        // Assign callback on click
        menuOptionElement.addEventListener("click", () => {
            menuOption.callback?.();
        });

        return menuOptionElement;
    }
}

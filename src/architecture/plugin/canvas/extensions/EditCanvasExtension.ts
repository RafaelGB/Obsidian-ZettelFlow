import { AllCanvasNodeData, Canvas, CanvasElement, SelectionData } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import { Notice, setIcon, setTooltip, TFile } from "obsidian";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { YamlService } from "architecture/plugin";
import { FrontmatterService } from "../../services/FrontmatterService";
import { StepBuilderMapper, StepBuilderModal } from "zettelkasten";
import { flowFolders, flowRole } from "architecture/plugin/canvas/flowRole";
import { c } from "architecture";
import { t } from "architecture/lang";
import CanvasHelper from "./utils/CanvasHelper";
import { popupMenuOptions } from "./utils/popupMenuOptions";

/** Button ids, shared with the cleanup: the popup is reused across selections (#432). */
const EDIT_STEP_BUTTON_ID = "edit-zettelflow-step-btn";
const COPY_FLOW_BUTTON_ID = "save-zettelflow-clipboard-btn";

interface MenuOption {
    id?: string;
    label: string;
    icon: string;
    /** Show the label beside the icon, not only as a tooltip (#686). */
    labelled?: boolean;
    callback?: () => void;
}

/**
 * Adds ZettelFlow's buttons to the canvas selection popup: *Edit step* when one step is selected —
 * a text or group node, or a file node whose note is a step — and *Copy flow* for a selection.
 */
export default class EditStepCanvasExtension extends CanvasExtension {
    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("canvas:popup-menu", (eventCanvas: Canvas) => {
                if (eventCanvas.isDragging) return;
                // The canvas is asked about itself: a focused file node makes the workspace's
                // active file the note it embeds, not this canvas (#686).
                if (!CanvasHelper.isCanvasFlow(this.plugin, eventCanvas)) return;

                // Clean up first: the popup is shared, so a button that no longer applies has
                // to be taken away, not merely not re-added (#432).
                CanvasHelper.removePopupMenuOption(eventCanvas, EDIT_STEP_BUTTON_ID);
                CanvasHelper.removePopupMenuOption(eventCanvas, COPY_FLOW_BUTTON_ID);

                const shape = CanvasHelper.selectionShape(eventCanvas);
                const stepNote = shape.kind === "file" ? this.selectedStepNote(eventCanvas) : null;
                const options = popupMenuOptions({ ...shape, stepNote: stepNote !== null });
                if (options.step) this.uniqueNodePopupMenu(eventCanvas, stepNote);
                if (options.copyFlow) this.multipleNodePopupMenu(eventCanvas);
            })
        );
    }

    /** The note a single selected file node shows, when that note already is a step. */
    private selectedStepNote(eventCanvas: Canvas): TFile | null {
        const [selected] = [...eventCanvas.selection];
        const note = CanvasHelper.nodeFile(this.plugin, selected);
        if (!note) return null;
        return FrontmatterService.instance(note).hasZettelFlowSettings() ? note : null;
    }

    private multipleNodePopupMenu(eventCanvas: Canvas) {
        const selectedNode: SelectionData = eventCanvas.getSelectionData();

        const newOption = this.createPopupMenuOption({
            id: COPY_FLOW_BUTTON_ID,
            label: t("canvas_menu_copy_flow"),
            icon: "copy",
            callback: () => {
                void navigator.clipboard.writeText(JSON.stringify(selectedNode, null, 2));
                new Notice(t("canvas_menu_flow_copied"));
            },
        });

        this.addPopupMenuOption(eventCanvas, newOption);
    }

    /**
     * *Edit step* for the one selected step. A text or group node keeps its step on the node; a
     * file node's step is its note, opened the way the file menu opens it (#686).
     */
    private uniqueNodePopupMenu(eventCanvas: Canvas, stepNote: TFile | null) {
        const file = CanvasHelper.canvasFile(this.plugin, eventCanvas);
        if (!file) return;
        if (!eventCanvas?.menu?.menuEl) return;

        const [selectedNode]: CanvasElement[] = [...eventCanvas.selection];
        if (!selectedNode) return;

        const data = selectedNode.getData() as AllCanvasNodeData;
        const builderMode =
            flowRole(file.path, flowFolders(this.plugin.settings)) === "create" ? "ribbon" : "editor";

        const open = (): void => {
            if (stepNote) {
                const settings = FrontmatterService.instance(stepNote).getZettelFlowSettings();
                new StepBuilderModal(this.plugin, {
                    folder: stepNote.parent || undefined,
                    filename: stepNote.basename,
                    ...StepBuilderMapper.StepSettings2PartialStepBuilderInfo(settings),
                })
                    .setMode("edit")
                    .setBuilder(builderMode)
                    .open();
                return;
            }
            if (data.type !== "text" && data.type !== "group") return;
            const stepSettings = YamlService.instance(data.zettelflowConfig).getZettelFlowSettings();
            new StepBuilderModal(this.plugin, {
                folder: file.parent || undefined,
                filename: file.basename,
                // The node's real kind: hardcoding "text" made the editor call a group an
                // inline box, which is the first thing the header claims to tell you (#424).
                type: data.type,
                ...stepSettings,
            })
                .setMode("embed")
                .setBuilder(builderMode)
                .setNodeId(data.id)
                .open();
        };

        const newOption = this.createPopupMenuOption({
            id: EDIT_STEP_BUTTON_ID,
            label: t("canvas_menu_edit_step"),
            icon: RibbonIcon.ID,
            labelled: true,
            callback: open,
        });

        this.addPopupMenuOption(eventCanvas, newOption);
    }

    /**
     * Inserts the option into the popup menu, replacing any element with the same id so there is
     * never a duplicate. Defaults to the position before the last item.
     */
    private addPopupMenuOption(canvas: Canvas, element: HTMLElement, index: number = -1): void {
        const popupMenuEl = canvas?.menu?.menuEl;
        if (!popupMenuEl) return;

        if (element.id) {
            popupMenuEl.querySelector(`#${element.id}`)?.remove();
        }

        const totalItems = popupMenuEl.children.length;
        const adjustedIndex = index >= 0 ? index : totalItems + index;
        const referenceItem = popupMenuEl.children[adjustedIndex];

        popupMenuEl.insertAfter(element, referenceItem);
    }

    /** One `clickable-icon` button, like Obsidian's own in the same row. */
    private createPopupMenuOption(menuOption: MenuOption): HTMLElement {
        const menuOptionElement = createEl("button", { cls: "clickable-icon" });
        if (menuOption.id) menuOptionElement.id = menuOption.id;

        setIcon(menuOptionElement, menuOption.icon);
        menuOptionElement.setAttr("aria-label", menuOption.label);
        if (menuOption.labelled) {
            menuOptionElement.addClass(c("canvas-menu-labelled"));
            menuOptionElement.createSpan({ text: menuOption.label });
        } else {
            setTooltip(menuOptionElement, menuOption.label, { placement: "top" });
        }

        menuOptionElement.addEventListener("click", () => {
            menuOption.callback?.();
        });

        return menuOptionElement;
    }
}

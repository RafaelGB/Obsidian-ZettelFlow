import { Canvas, CanvasElement } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import { setIcon, setTooltip } from "obsidian";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { YamlService } from "architecture/plugin";
import { StepBuilderModal } from "zettelkasten";

interface MenuOption {
    id?: string
    label: string
    icon: string
    callback?: () => void
}

export default class EditStepCanvasExtension extends CanvasExtension {
    init(): void {
        this.plugin.registerEvent(this.plugin.app.workspace.on(
            "canvas:popup-menu",
            (canvas) => {
                console.log("Canvas:popup-menu event triggered")
                const popupMenuEl = canvas?.menu?.menuEl;
                if (!popupMenuEl) return

                // Check if canvas is the zettelFlow canvas and if the node is embedded
                const file = this.plugin.app.workspace.getActiveFile();
                if (file === null) {
                    return;
                }

                const { ribbonCanvas, editorCanvas, foldersFlowsPath } = this.plugin.settings;
                // Discard canvas if file.path is not one of the zettelFlow canvases
                if (ribbonCanvas !== file.path && editorCanvas !== file.path && !file.path.startsWith(foldersFlowsPath)) {
                    return;
                }

                if (canvas.selection.size !== 1) return;
                // Obtain the selected node (is a Set and we need the first element)
                const selectedNode: CanvasElement = canvas.selection.values().next().value;


                // Add new option
                const newOption = this.createPopupMenuOption({
                    label: "Edit ZettelFlow Step",
                    icon: RibbonIcon.ID,
                    callback: () => {
                        const data = selectedNode.getData();
                        const builderMode = ribbonCanvas === file.path ? "ribbon" : "editor";
                        if (data.type === "text" || data.type === "group") {
                            const zettelFlowSettings = data.zettelflowConfig;
                            const stepSettings = YamlService.instance(zettelFlowSettings).getZettelFlowSettings();
                            new StepBuilderModal(this.plugin.app, {
                                folder: file.parent || undefined,
                                filename: file.basename,
                                type: "text",
                                //TODO: comprobar si sigue siendo necesario: menu,
                                ...stepSettings
                            })
                                .setMode("embed")
                                .setBuilder(builderMode)
                                .setNodeId(data.id)
                                .open();
                        }
                    }
                })

                this.addPopupMenuOption(canvas, newOption);
            }
        ))
    }

    private addPopupMenuOption(canvas: Canvas, element: HTMLElement, index: number = -1) {
        const popupMenuEl = canvas?.menu?.menuEl
        if (!popupMenuEl) return

        if (element.id) {
            const optionToReplace = popupMenuEl.querySelector(`#${element.id}`)
            if (optionToReplace && index === -1) index = Array.from(popupMenuEl.children).indexOf(optionToReplace) - 1
            optionToReplace?.remove()
        }

        const sisterElement = index >= 0 ? popupMenuEl.children[index] : popupMenuEl.children[popupMenuEl.children.length + index]
        popupMenuEl.insertAfter(element, sisterElement)
    }

    private createPopupMenuOption(menuOption: MenuOption): HTMLElement {
        const menuOptionElement = document.createElement('button')
        if (menuOption.id) menuOptionElement.id = menuOption.id
        menuOptionElement.classList.add('clickable-icon')
        setIcon(menuOptionElement, menuOption.icon)
        setTooltip(menuOptionElement, menuOption.label, { placement: 'top' })
        menuOptionElement.addEventListener('click', () => menuOption.callback?.())

        return menuOptionElement
    }
}
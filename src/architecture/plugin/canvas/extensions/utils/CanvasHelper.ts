import ZettelFlow from "main"
import { setIcon, setTooltip } from "obsidian"
import { log } from "architecture"
import { Canvas, CanvasNode, Position, Size } from "obsidian/canvas"


export interface MenuOption {
    id?: string
    label: string
    icon: string
    callback?: () => void
}

export default class CanvasHelper {
    static readonly GRID_SIZE = 20

    /**
     * What the canvas has selected, as the pure decision function wants it (#432). Feature-detected:
     * an unreadable selection reports `size: 0`, which offers nothing rather than guessing.
     */
    static selectionShape(canvas: Canvas): { size: number; kind: string | undefined } {
        try {
            const selection = canvas?.selection;
            const size = selection?.size ?? 0;
            if (size !== 1) return { size, kind: undefined };

            const [selected] = [...selection];
            const id = (selected as unknown as { id?: string })?.id;
            const edges = canvas?.edges as Map<string, unknown> | undefined;
            if (id && typeof edges?.get === "function" && edges.get(id)) {
                return { size, kind: "edge" };
            }
            const data = (selected as unknown as { getData?: () => { type?: string } })?.getData?.();
            return { size, kind: data?.type };
        } catch (error) {
            log.warn("ZettelFlow: could not read the canvas selection", error);
            return { size: 0, kind: undefined };
        }
    }

    /**
     * Remove a button this plugin added. Obsidian reuses the same popup across selections, so an
     * extension that only ever *adds* leaves its button behind when its condition stops holding
     * (#432). Removing something that is not there is a no-op.
     */
    static removePopupMenuOption(canvas: Canvas, id: string): void {
        canvas?.menu?.menuEl?.querySelector(`#${id}`)?.remove();
    }

    /**
     * Select and centre a node on an open canvas (#424).
     *
     * The leaves come from the **public** `getLeavesOfType`; only the selection call is
     * undocumented, so three shapes are feature-detected and a failure returns `false` for the
     * caller to hide its action rather than throwing (constitution §VI).
     */
    static revealNode(plugin: ZettelFlow, nodeId: string): boolean {
        try {
            for (const leaf of plugin.app.workspace.getLeavesOfType("canvas")) {
                const canvas = (leaf.view as unknown as { canvas?: Canvas })?.canvas;
                const nodes = canvas?.nodes;
                if (!canvas || typeof nodes?.get !== "function") continue;
                const node = nodes.get(nodeId);
                if (!node) continue;
                if (!CanvasHelper.selectNode(canvas, node)) return false;
                void plugin.app.workspace.revealLeaf(leaf);
                return true;
            }
            return false;
        } catch (error) {
            log.warn("ZettelFlow: could not reveal the node on the canvas", error);
            return false;
        }
    }

    /** The three selection shapes Obsidian has shipped; none of them is documented. */
    private static selectNode(canvas: Canvas, node: CanvasNode): boolean {
        const api = canvas as unknown as {
            selectOnly?: (node: CanvasNode) => void;
            select?: (node: CanvasNode) => void;
            updateSelection?: (update: () => void) => void;
            selection?: Set<unknown>;
            deselectAll?: () => void;
            zoomToSelection?: () => void;
        };
        if (typeof api.selectOnly === "function") {
            api.selectOnly(node);
        } else if (typeof api.select === "function") {
            api.deselectAll?.();
            api.select(node);
        } else if (typeof api.updateSelection === "function" && api.selection) {
            api.deselectAll?.();
            api.updateSelection(() => api.selection?.add(node));
        } else {
            log.warn("ZettelFlow: no known canvas selection API — reveal skipped");
            return false;
        }
        api.zoomToSelection?.();
        return true;
    }

    static createControlMenuButton(menuOption: MenuOption): HTMLElement {
        const quickSetting = createDiv()
        if (menuOption.id) quickSetting.id = menuOption.id
        quickSetting.classList.add('canvas-control-item')
        setIcon(quickSetting, menuOption.icon)
        setTooltip(quickSetting, menuOption.label, { placement: 'left' })
        quickSetting.addEventListener('click', () => menuOption.callback?.())

        return quickSetting
    }

    static addControlMenuButton(controlGroup: HTMLElement, element: HTMLElement) {
        if (element.id) controlGroup.querySelector(`#${element.id}`)?.remove()
        controlGroup.appendChild(element)
    }

    static createCardMenuOption(canvas: Canvas, menuOption: MenuOption, previewNodeSize: () => Size, onPlaced: (canvas: Canvas, pos: Position) => void): HTMLElement {
        const menuOptionElement = createDiv()
        if (menuOption.id) menuOptionElement.id = menuOption.id
        menuOptionElement.classList.add('canvas-card-menu-button')
        menuOptionElement.classList.add('mod-draggable')
        setIcon(menuOptionElement, menuOption.icon)
        setTooltip(menuOptionElement, menuOption.label, { placement: 'top' })

        menuOptionElement.addEventListener('click', (_e) => {
            onPlaced(canvas, this.getCenterCoordinates(canvas, previewNodeSize()))
        })

        menuOptionElement.addEventListener('pointerdown', (e) => {
            canvas.dragTempNode(e, previewNodeSize(), (pos: Position) => {
                canvas.deselectAll()
                onPlaced(canvas, pos)
            })
        })

        return menuOptionElement
    }

    static addCardMenuOption(canvas: Canvas, element: HTMLElement) {
        if (element.id) canvas?.cardMenuEl.querySelector(`#${element.id}`)?.remove()
        canvas?.cardMenuEl.appendChild(element)
    }

    static createPopupMenuOption(menuOption: MenuOption): HTMLElement {
        const menuOptionElement = createEl('button')
        if (menuOption.id) menuOptionElement.id = menuOption.id
        menuOptionElement.classList.add('clickable-icon')
        setIcon(menuOptionElement, menuOption.icon)
        setTooltip(menuOptionElement, menuOption.label, { placement: 'top' })
        menuOptionElement.addEventListener('click', () => menuOption.callback?.())

        return menuOptionElement
    }

    static createExpandablePopupMenuOption(menuOption: MenuOption, subMenuOptions: MenuOption[]): HTMLElement {
        const menuOptionElement = this.createPopupMenuOption({
            ...menuOption,
            callback: () => {
                const submenuId = `${menuOption.id}-submenu`

                if (menuOptionElement.classList.contains('is-active')) {
                    menuOptionElement.classList.remove('is-active')
                    menuOptionElement.parentElement?.querySelector(`#${submenuId}`)?.remove()
                    return
                }

                menuOptionElement.classList.add('is-active')

                // Add popup menu
                const submenu = createDiv()
                submenu.id = submenuId
                submenu.classList.add('canvas-submenu')

                // Add nested options
                for (const subMenuOption of subMenuOptions) {
                    const subMenuOptionElement = this.createPopupMenuOption(subMenuOption)
                    submenu.appendChild(subMenuOptionElement)
                }

                menuOptionElement.parentElement?.appendChild(submenu)
            }
        })

        return menuOptionElement
    }

    static addPopupMenuOption(canvas: Canvas, element: HTMLElement, index: number = -1) {
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

    static getCenterCoordinates(canvas: Canvas, nodeSize: Size): Position {
        const viewBounds = canvas.getViewportBBox()

        return {
            x: (viewBounds.minX + viewBounds.maxX) / 2 - nodeSize.width / 2,
            y: (viewBounds.minY + viewBounds.maxY) / 2 - nodeSize.height / 2,
        }
    }



    static readonly MAX_ALLOWED_ZOOM = 1


    static createDropdownOptionElement(menuOption: MenuOption): HTMLElement {
        const menuDropdownOptionElement = createDiv()
        menuDropdownOptionElement.classList.add('menu-item')
        menuDropdownOptionElement.classList.add('tappable')

        // Add icon
        const iconElement = createDiv()
        iconElement.classList.add('menu-item-icon')
        setIcon(iconElement, menuOption.icon)
        menuDropdownOptionElement.appendChild(iconElement)

        // Add label
        const labelElement = createDiv()
        labelElement.classList.add('menu-item-title')
        labelElement.textContent = menuOption.label
        menuDropdownOptionElement.appendChild(labelElement)

        // Add hover effect
        menuDropdownOptionElement.addEventListener('pointerenter', () => {
            menuDropdownOptionElement.classList.add('selected')
        })

        menuDropdownOptionElement.addEventListener('pointerleave', () => {
            menuDropdownOptionElement.classList.remove('selected')
        })

        // Add click event
        menuDropdownOptionElement.addEventListener('click', () => {
            menuOption.callback?.()
        })

        return menuDropdownOptionElement
    }

    static createDropdownSeparatorElement(): HTMLElement {
        const separatorElement = createDiv()
        separatorElement.classList.add('menu-separator')

        return separatorElement
    }

    static isCanvasFlow(plugin: ZettelFlow): boolean {
        // Check if canvas is one of the ZettelFlow canvases
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return false;
        const { ribbonCanvas, editorCanvas, foldersFlowsPath, hooks } = plugin.settings;
        if (
            ribbonCanvas !== file.path &&
            editorCanvas !== file.path &&
            !file.path.startsWith(foldersFlowsPath) &&
            !file.path.startsWith(hooks.folderFlowPath)
        ) {
            return false;
        }
        return true;
    }
}
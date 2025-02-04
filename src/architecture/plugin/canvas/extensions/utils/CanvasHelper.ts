import ZettelFlow from "main"
import { setIcon, setTooltip } from "obsidian"
import { Canvas, Position, Size } from "obsidian/canvas"


export interface MenuOption {
    id?: string
    label: string
    icon: string
    callback?: () => void
}

export default class CanvasHelper {
    static readonly GRID_SIZE = 20

    static createControlMenuButton(menuOption: MenuOption): HTMLElement {
        const quickSetting = document.createElement('div')
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
        const menuOptionElement = document.createElement('div')
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
        const menuOptionElement = document.createElement('button')
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
                const submenu = document.createElement('div')
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
        const menuDropdownOptionElement = document.createElement('div')
        menuDropdownOptionElement.classList.add('menu-item')
        menuDropdownOptionElement.classList.add('tappable')

        // Add icon
        const iconElement = document.createElement('div')
        iconElement.classList.add('menu-item-icon')
        setIcon(iconElement, menuOption.icon)
        menuDropdownOptionElement.appendChild(iconElement)

        // Add label
        const labelElement = document.createElement('div')
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
        const separatorElement = document.createElement('div')
        separatorElement.classList.add('menu-separator')

        return separatorElement
    }

    static isCanvasFlow(plugin: ZettelFlow): boolean {
        // Check if canvas is one of the ZettelFlow canvases
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return false;
        const { ribbonCanvas, editorCanvas, foldersFlowsPath } = plugin.settings;
        if (
            ribbonCanvas !== file.path &&
            editorCanvas !== file.path &&
            !file.path.startsWith(foldersFlowsPath)
        ) {
            return false;
        }
        return true;
    }
}
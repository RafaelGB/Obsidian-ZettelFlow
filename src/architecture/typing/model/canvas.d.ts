import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import "obsidian/canvas";

declare module "obsidian/canvas" {
    interface CanvasTextData extends CanvasNodeData {
        type: 'text';
        text: string;
        unknownData: {
            zettelflowConfig?: string;
            [key: string]: any;
        };
        zettelflowConfig: string;
    }

    interface Size {
        width: number
        height: number
    }

    interface Position {
        x: number
        y: number
    }

    interface BBox {
        minX: number
        maxX: number
        minY: number
        maxY: number
    }

    interface Canvas {
        view: CanvasView
        config: CanvasConfig
        options: CanvasOptions
        metadata: CanvasMetadata

        getData(): CanvasData
        setData(data: CanvasData): void

        /** Basically setData (if clearCanvas == true), but without modifying the history */
        importData(data: CanvasData, clearCanvas?: boolean): void

        nodes: Map<string, CanvasNode>
        edges: Map<string, CanvasEdge>
        getEdgesForNode(node: CanvasNode): CanvasEdge[]

        wrapperEl: HTMLElement
        canvasEl: HTMLElement
        menu: PopupMenu
        cardMenuEl: HTMLElement
        canvasControlsEl: HTMLElement
        quickSettingsButton: HTMLElement
        nodeInteractionLayer: NodeInteractionLayer

        canvasRect: DOMRect
        getViewportBBox(): BBox
        setViewport(tx: number, ty: number, tZoom: number): void
        markViewportChanged(): void

        x: number
        y: number
        zoom: number

        tx: number
        ty: number
        tZoom: number

        isDragging: boolean
        setDragging(dragging: boolean): void

        zoomToBbox(bbox: BBox): void
        zoomToSelection(): void

        readonly: boolean
        setReadonly(readonly: boolean): void

        selection: Set<CanvasElement>
        getSelectionData(): SelectionData
        updateSelection(update: () => void): void
        deselectAll(): void

        toggleObjectSnapping(enabled: boolean): void
        dragTempNode(dragEvent: any, nodeSize: Size, onDropped: (position: Position) => void): void

        createTextNode(options: { [key: string]: any }): CanvasNode
        createGroupNode(options: { [key: string]: any }): CanvasNode
        createFileNode(options: { [key: string]: any }): CanvasNode

        addNode(node: CanvasNode): void
        removeNode(node: CanvasNode): void
        addEdge(edge: CanvasEdge): void
        removeEdge(edge: CanvasEdge): void

        getContainingNodes(bbox: BBox): CanvasNode[]

        history: CanvasHistory
        pushHistory(data: CanvasData): void
        undo(): void
        redo(): void

        posFromEvt(event: MouseEvent): Position
        onDoubleClick(event: MouseEvent): void
        handlePaste(): void
        requestSave(): void

        // Custom
        isCopying: boolean
        lockedX: number
        lockedY: number
        lockedZoom: number
    }

    interface CanvasOptions {
        snapToObjects: boolean
        snapToGrid: boolean
    }

    interface CanvasMetadata {
        properties: { [key: string]: any }
    }

    interface CanvasHistory {
        data: CanvasData[]
        current: number
        max: number

        applyHistory: (data: CanvasData) => void
        canUndo: () => boolean
        undo: () => CanvasData | null
        canRedo: () => boolean
        redo: () => CanvasData | null
    }

    interface SelectionData {
        nodes: CanvasNodeData[]
        edges: CanvasEdgeData[]
        center: Position
    }

    interface CanvasConfig {
        defaultTextNodeDimensions: Size
        defaultFileNodeDimensions: Size
        minContainerDimension: number
    }

    interface CanvasView extends ItemView {
        _loaded: boolean
        file: TFile
        canvas: Canvas
        leaf: CanvasWorkspaceLeaf

        getViewData(): string
        setViewData(data: string): void
    }

    interface CanvasWorkspaceLeaf extends WorkspaceLeaf {
        id: string
    }

    interface NodeOptions {
        pos: Position
        size: Size
        save?: boolean
        focus?: boolean
    }

    interface TextNodeOptions extends NodeOptions {
        text?: string
    }

    interface GroupNodeOptions extends NodeOptions {
        label?: string
    }

    interface FileNodeOptions extends NodeOptions {
        file: TFile
        subpath?: string
    }

    interface CanvasElement {
        canvas: Canvas
        initialized: boolean
        isDirty?: boolean // Custom for Change event

        child: {
            editMode: {
                cm: {
                    dom: HTMLElement
                }
            }
        }

        initialize(): void
        setColor(color: string): void

        setIsEditing(editing: boolean): void
        getBBox(): BBox

        getData(): CanvasNodeData | CanvasEdgeData
        setData(data: CanvasNodeData | CanvasEdgeData): void
    }

    type CanvasNodeType = 'text' | 'group' | 'file' | 'link'
    interface CanvasNodeData {
        canvas: {
            data: CanvasData;
        }
        id: string
        x: number
        y: number
        width: number
        height: number

        type: CanvasNodeType
        text?: string
        label?: string
        file?: string

        // TODO: needsToBeInitialized?: boolean
        styleAttributes?: { [key: string]: string | null }

        lockedHeight?: boolean

        isCollapsed?: boolean
        collapsedData?: CanvasData

        isStartNode?: boolean
        sideRatio?: number

        edgesToNodeFromPortal?: { [key: string]: CanvasEdgeData[] }

        // Portal node
        portalToFile?: string
        closedPortalWidth?: number
        closedPortalHeight?: number
        portalIdMaps?: {
            nodeIdMap: { [key: string]: string }
            edgeIdMap: { [key: string]: string }
        }

        // Node from portal
        portalId?: string
    }

    interface CanvasNode extends CanvasElement {
        isEditing: boolean

        nodeEl: HTMLElement
        contentEl: HTMLElement

        labelEl?: HTMLElement
        file?: TFile

        x: number
        y: number
        width: number
        height: number

        /** Move node to the front. */
        zIndex: number
        updateZIndex(): void

        color: string

        setData(data: CanvasNodeData, addHistory?: boolean): void
        getData(): CanvasNodeData
    }

    type Side = 'top' | 'right' | 'bottom' | 'left'
    type EndType = 'none' | 'arrow'
    interface CanvasEdgeData {
        id: string

        fromNode: string
        toNode: string

        fromSide: Side
        toSide: Side

        fromEnd?: EndType
        toEnd?: EndType

        styleAttributes?: { [key: string]: string | null }

        portalId?: string
        isUnsaved?: boolean

        [key: string]: any
    }

    interface CanvasEdge extends CanvasElement {
        label: string

        from: {
            node: CanvasNode
            side: Side
            end: EndType
        }
        fromLineEnd: {
            el: HTMLElement
            type: 'arrow'
        }

        to: {
            node: CanvasNode
            side: Side
            end: EndType
        }
        toLineEnd: {
            el: HTMLElement
            type: 'arrow'
        }

        bezier: {
            from: Position
            to: Position
            cp1: Position
            cp2: Position
            path: string
        }

        path: {
            interaction: HTMLElement
            display: HTMLElement
        }

        labelElement: {
            edge: CanvasEdge
            initialTextState: string
            isEditing: boolean
            textareaEl: HTMLElement
            wrapperEl: HTMLElement

            render(): void
        }

        /** Custom field */
        center?: Position
        getCenter(): Position
        render(): void
        updatePath(): void

        setData(data: CanvasEdgeData, addHistory?: boolean): void
        getData(): CanvasEdgeData
    }

    interface NodeInteractionLayer {
        interactionEl: HTMLElement
        setTarget(node: CanvasNode): void
    }

    interface PopupMenu {
        menuEl: HTMLElement
        render(): void
    }
}
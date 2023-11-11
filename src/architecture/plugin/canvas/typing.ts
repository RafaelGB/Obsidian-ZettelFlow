import { TFile } from "obsidian"
import { CanvasData } from "obsidian/canvas"

export interface Canvas {
    flows: Flows
}

export interface Flows {
    get: (id: string) => Flow
    add: (canvasPath: string) => Promise<Flow>
    update: (id: string) => Promise<Flow>
    delete: (id: string) => boolean
}

export interface Flow {
    data: CanvasData
    editNode: (nodeId: string, text: string) => Promise<void>
    childrensOf: (nodeId: string) => FlowNode[]
    parentsOf: (nodeId: string) => FlowNode[]
}

export type ZettelNodeType = "text" | "file" | "link" | "group";

export type FlowNode = {
    id: string;
    type: ZettelNodeType
    tooltip?: string;
    color?: string;
    // EXCLUSIVE TO FILE
    file?: TFile;
    // EXCLUSIVE TO TEXT
    text?: string;
}
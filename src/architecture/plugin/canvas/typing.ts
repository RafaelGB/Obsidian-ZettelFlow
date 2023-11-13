import { CanvasData } from "obsidian/canvas"
import { Literal } from "../model/FrontmatterModel"
import { StepSettings } from "zettelkasten"

export interface Canvas {
    flows: Flows
}

export interface Flows {
    get: (id: string) => Flow
    add: (canvasPath: string) => Promise<Flow>
    delete: (id: string) => boolean
    update: (canvasPath: string) => Promise<Flow>
}

export interface Flow {
    data: CanvasData
    editTextNode: (nodeId: string, text: string) => Promise<void>
    get: (nodeId: string) => Promise<FlowNode>
    childrensOf: (nodeId: string) => Promise<FlowNode[]>
    parentsOf: (nodeId: string) => Promise<FlowNode[]>
    rootNodes: () => Promise<FlowNode[]>
    // Clipboard
    copy: (nodeId: string) => Promise<void>
    paste: (nodeId: string) => Promise<void>
}

export type ZettelNodeType = "text" | "file" | "link" | "group";

export type FlowNode = {
    id: string
    type: ZettelNodeType,
    color: string,
    tooltip?: string,
    // EXCLUSIVE FILE NODES
    path?: string,
} & StepSettings;

export type Action = {
    type: string;
    description?: string;
    hasUI?: boolean;
    [key: string]: Literal;
};
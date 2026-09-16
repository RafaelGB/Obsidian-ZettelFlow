import { CanvasData } from "obsidian/canvas"
import { Literal } from "../model/FrontmatterModel"
import { StepSettings } from "zettelkasten"

export interface Canvas {
    flows: Flows
    clipboard: CanvasClipboard
}

export interface Flows {
    get: (id: string) => Flow
    add: (canvasPath: string) => Promise<Flow>
    delete: (id: string) => boolean
    update: (canvasPath: string) => Promise<Flow>
}

export interface Flow {
    data: CanvasData
    readonly canvasPath: string
    editTextNode: (nodeId: string, text: string) => Promise<void>
    /** Rewrite arrow labels in one pass; an empty string removes the label (#427). */
    editEdgeLabels: (labels: Record<string, string>) => Promise<void>
    /** Paint a node with a canvas colour preset; an empty string clears it (#429). */
    editNodeColor: (nodeId: string, color: string) => Promise<void>
    get: (nodeId: string) => Promise<FlowNode>
    childrensOf: (nodeId: string) => Promise<FlowNode[]>
    parentsOf: (nodeId: string) => Promise<FlowNode[]>
    rootNodes: () => Promise<FlowNode[]>
}

export type ZettelNodeType = "text" | "file" | "link" | "group" | "javascript";

export type FlowNode = {
    id: string
    type: ZettelNodeType,
    color: string,
    tooltip?: string,
    /** The canvas edge this child was reached through (#427); absent for a child of a group. */
    edgeId?: string,
    /** What this option says once the step's exits are resolved (#427); set by the wizard. */
    says?: string,
    /** The option the wizard lands on (#427); set by the wizard. */
    isDefault?: boolean,
    // EXCLUSIVE FILE NODES
    path?: string,
    extension?: string,
} & StepSettings;

export type Action = {
    type: string;
    description?: string;
    hasUI?: boolean;
    [key: string]: Literal;
};

export interface CanvasClipboard {
    save: (settings: StepSettings) => void
    get: () => StepSettings | undefined
    clear: () => void
}
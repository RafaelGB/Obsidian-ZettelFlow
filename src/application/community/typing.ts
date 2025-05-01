import ZettelFlow from "main";
import { CanvasNodeData, Position } from "obsidian/canvas";
import { StepSettings } from "zettelkasten";

export type CommunityStep = {
    title: string;
    description: string;
} & StepSettings;

export type PluginComponentProps = {
    plugin: ZettelFlow;
}

export interface CommunityFlowNode extends CanvasNodeData {
    index: number;
    zettelflowConfig?: string;
    color?: string;
    label?: string;
    file?: string;
    [key: string]: any;
    // Additional properties can be added as needed
}

export interface CommunityFlowEdge {
    id: string;
    fromNode: string;
    fromSide: string;
    toNode: string;
    toSide: string;
    color?: string;
    label?: string;
}

export interface CommunityFlowData {
    id: string;
    title: string;
    description: string;
    template_type: string;
    author: string;
    nodes: CommunityFlowNode[];
    edges: CommunityFlowEdge[];
    center: Position;
}
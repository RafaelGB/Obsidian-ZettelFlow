import ZettelFlow from "main";
import { Position } from "obsidian/canvas";
import { StepSettings } from "zettelkasten";

export type CommunityStep = {
    title: string;
    description: string;
} & StepSettings;

export type PluginComponentProps = {
    plugin: ZettelFlow;
}

export interface CommunityFlowNode {
    index: number;
    id: string;
    type: string;
    zettelflowConfig?: string;
    text?: string;
    x: number;
    y: number;
    width: number;
    height: number;
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
    title: string;
    description: string;
    template_type: string;
    author: string;
    nodes: CommunityFlowNode[];
    edges: CommunityFlowEdge[];
    center: Position;
}
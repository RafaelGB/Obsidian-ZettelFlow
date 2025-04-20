import ZettelFlow from "main";
import { StepSettings } from "zettelkasten";

export type CommunityStep = {
    title: string;
    description: string;
} & StepSettings;

export type PluginComponentProps = {
    plugin: ZettelFlow;
}

export interface FlowNode {
    id: string;
    type: string;
    zettelflowConfig?: string;
    text?: string;
    width: number;
    height: number;
    color?: string;
    label?: string;
}

export interface FlowEdge {
    id: string;
    fromNode: string;
    fromSide: string;
    toNode: string;
    toSide: string;
    color?: string;
    label?: string;
}

export interface FlowData {
    title: string;
    description: string;
    template_type: string;
    author: string;
    nodes: FlowNode[];
    edges: FlowEdge[];
}
import { ObsidianApi, log } from "architecture";
import { Flow, FlowNode, Flows } from "./typing";
import { AllCanvasNodeData, CanvasData, CanvasFileData, CanvasTextData } from "obsidian/canvas";
import { FileService } from "../services/FileService";
import { Notice, TFile } from "obsidian";
import { YamlService } from "../services/YamlService";
import { FrontmatterService } from "../services/FrontmatterService";
import { StepSettings } from "zettelkasten";
import { getCanvasColor } from "./shared/Color";

export class FlowsImpl implements Flows {
    private flows: Map<string, Flow>;

    constructor() {
        this.flows = new Map();
    }

    get = (id: string) => {
        const potentialFlow = this.flows.get(id);
        if (!potentialFlow) {
            log.error(`Flow ${id} not found`);
            throw new Error(`Flow ${id} not found`);
        }
        return potentialFlow;
    }

    add = async (canvasPath: string) => {
        const canvasFile = await FileService.getFile(canvasPath);
        if (!canvasFile) {
            throw new Error(`Canvas file ${canvasPath} not found`);
        }
        const content = await FileService.getContent(canvasFile);
        const data: CanvasData = JSON.parse(content);
        const flow = new FlowImpl(data, canvasFile);
        this.flows.set(canvasFile.path, flow);
        return flow;
    }

    update = async (id: string) => {
        if (this.flows.has(id)) {
            return this.add(id);
        }
        throw new Error(`Flow ${id} not found`);
    }

    delete = (id: string) => {
        return this.flows.delete(id);
    }
}

export class FlowImpl implements Flow {
    private nodes: Map<string, AllCanvasNodeData>;
    constructor(public data: CanvasData, private file: TFile) {
        this.nodes = data.nodes.reduce((map, obj) => {
            map.set(obj.id, obj);
            return map;
        }, new Map<string, AllCanvasNodeData>());
    }

    get = async (nodeId: string) => {
        const node = this.nodes.get(nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }
        switch (node.type) {
            case "text":
                const textNode = YamlService.instance(node.text);
                return this.populateNode(node, textNode.getZettelFlowSettings());
            case "file":
                const file = await FileService.getFile(node.file);
                if (!file) {
                    throw new Error(`File ${node.file} not found`);
                }
                const fileNode = FrontmatterService.instance(file);
                return this.populateNode(node, fileNode.getZettelFlowSettings());
            default:
                throw new Error(`Node ${nodeId} not supported`);
        }
    }

    editNode = async (nodeId: string, text: string) => {
        const node = this.data.nodes.find(node => node.id === nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }
        node.text = text;
        await this.save();
    }

    childrensOf = async (nodeId: string) => {
        const { edges } = this.data;
        const childrenKeys = edges.filter(edge => edge.fromNode === nodeId).map(edge => edge.toNode);
        return this.nodesFrom(childrenKeys);
    }

    parentsOf = async (nodeId: string) => {
        const { edges } = this.data;
        const parentKeys = edges.filter(edge => edge.toNode === nodeId).map(edge => edge.fromNode);
        return this.nodesFrom(parentKeys);
    }

    rootNodes = async () => {
        // Map nodes to check if they are root
        const rootNodes: FlowNode[] = [];
        const { nodes } = this.data;
        nodes.forEach(async node => {
            switch (node.type) {
                case "text":
                    const textNode = YamlService.instance(node.text);
                    if (textNode.isRoot()) {
                        const flowNode = textNode.getZettelFlowSettings();
                        rootNodes.push(this.populateNode(node, flowNode));
                    }
                    break;
                case "file":
                    const file = await FileService.getFile(node.file);
                    if (!file) {
                        throw new Error(`File ${node.file} not found`);
                    }
                    const fileNode = FrontmatterService.instance(file);
                    if (fileNode.equals("zettelFlowSettings.root", true)) {
                        const flowNode = fileNode.getZettelFlowSettings();
                        rootNodes.push(this.populateNode(node, flowNode));
                    }
            }
        });
        return rootNodes;
    }

    private nodesFrom(keys: string[]): FlowNode[] {
        const flowNodes: FlowNode[] = [];
        keys.forEach(async key => {
            const node = this.nodes.get(key);
            if (node) {
                switch (node.type) {
                    case "text":
                        const textNode = YamlService.instance(node.text);
                        flowNodes.push(this.populateNode(node, textNode.getZettelFlowSettings()));
                        break;
                    case "file":
                        const file = await FileService.getFile(node.file);
                        if (file) {
                            const fileNode = FrontmatterService.instance(file);
                            flowNodes.push(this.populateNode(node, fileNode.getZettelFlowSettings()));
                        }
                        break;
                }
            }
        });
        return flowNodes;
    }

    private async save() {
        await ObsidianApi.vault()
            .modify(this.file, JSON.stringify(this.data))
            .catch(error => {
                const errorString = `Error saving canvas on ${this.file.path}: ${error}`;
                log.error(errorString);
                new Notice(errorString);
            });
    }

    private populateNode(data: CanvasTextData | CanvasFileData, node: StepSettings): FlowNode {
        return {
            ...node,
            color: getCanvasColor(data.color),
            id: data.id,
        }
    }
}
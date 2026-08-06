import { FatalError, ObsidianApi, log } from "architecture";
import { Flow, FlowNode, Flows } from "./typing";
import { AllCanvasNodeData, CanvasData, CanvasFileData, CanvasGroupData, CanvasTextData } from "obsidian/canvas";
import { FileService } from "../services/FileService";
import { Notice, TFile, parseYaml } from "obsidian";
import { YamlService } from "../services/YamlService";
import { FrontmatterService } from "../services/FrontmatterService";
import { StepSettings } from "zettelkasten";
import { getCanvasColor } from "./shared/Color";
import { canvasJsonFormatter } from "./formatter";
import { findDirectChildren, isNodeInside } from "./shared/Geometry";

type EdgeInfo = {
    key: string;
    tooltip: string | undefined
}

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
        const data = JSON.parse(content) as CanvasData;
        const flow = new FlowImpl(data, canvasFile);
        this.flows.set(canvasFile.path, flow);
        log.info(`Flow ${canvasPath} loaded`);
        return flow;
    }

    /**
     * Search for the flow in the cache, if not found, add it to the cache.
     * @param canvasPath 
     * @returns 
     */
    update = async (canvasPath: string) => {
        const flow = this.flows.get(canvasPath);
        if (!flow) {
            log.info(`Flow ${canvasPath} not found, loading...`);
            return await this.add(canvasPath);
        }
        return flow;
    }

    delete = (id: string) => {
        log.info(`Cleaning flow ${id}`);
        return this.flows.delete(id);
    }
}

export class FlowImpl implements Flow {
    private nodes: Map<string, AllCanvasNodeData>;

    get canvasPath(): string {
        return this.file.path;
    }

    constructor(public data: CanvasData, private file: TFile) {
        this.nodes = data.nodes
            .filter(node => node.type !== "link")
            .reduce((map, obj) => {
                // Note: we intentionally do NOT stamp a synthetic `extension` field on the node.
                // `.js` file nodes are detected from the TFile extension at use-time; mutating the
                // persisted node object here would serialize a non-schema key back into the canvas.
                map.set(obj.id, obj);
                return map;
            }, new Map<string, AllCanvasNodeData>());
    }


    get = async (nodeId: string) => {
        const node = this.nodes.get(nodeId);
        if (!node) {
            throw new FatalError(`Node ${nodeId} not found`);
        }
        switch (node.type) {
            case "text":
            case "group": {
                const textNode = YamlService.instance(node.zettelflowConfig);
                return this.populateNode(node, textNode.getZettelFlowSettings());
            }
            case "file": {
                ObsidianApi.vault().getFileByPath(node.file);
                const file = await FileService.getFile(node.file);
                if (!file) {
                    throw new FatalError(`File ${node.file} not found`);
                }
                switch (file.extension) {
                    case "md": {
                        const fileNode = FrontmatterService.instance(file);
                        return this.populateNode(node, fileNode.getZettelFlowSettings());
                    }
                    case "js": {
                        return this.populateScriptNode(node, file);
                    }
                    default: {
                        throw new Error(`Externsion ${node.file} not supported for file ${file.basename}`);
                    }
                }
            }

            default:
                throw new Error(`Node ${nodeId} not supported`);
        }
    }

    editTextNode = async (nodeId: string, text: string) => {
        await this.refresh();
        const index = this.data.nodes.findIndex(node => node.id === nodeId);
        if (index === -1) {
            throw new Error(`Node ${nodeId} not found`);
        }
        this.data.nodes[index].zettelflowConfig = text;
        this.nodes.set(nodeId, this.data.nodes[index]);
        await this.save();
    }

    childrensOf = async (nodeId: string) => {
        const node = this.nodes.get(nodeId);
        if (node?.type !== "group") {
            const { edges } = this.data;
            const childrenKeys: EdgeInfo[] = edges.filter(edge => edge.fromNode === nodeId).map(edge => ({ key: edge.toNode, tooltip: edge.label }));
            return this.nodesFrom(childrenKeys);
        } else {
            const childNodes = findDirectChildren(node, this.data.nodes);
            const childrenKeys: EdgeInfo[] = childNodes.map(child => ({ key: child.id, tooltip: `Child of ${node.label}` }));

            return this.nodesFrom(childrenKeys);
        }
    }

    parentsOf = async (nodeId: string) => {
        const node = this.nodes.get(nodeId);
        if (node?.type !== "group") {
            const { edges } = this.data;
            const parentKeys = edges.filter(edge => edge.toNode === nodeId).map(edge => ({ key: edge.fromNode, tooltip: edge.label }));
            return this.nodesFrom(parentKeys);
        } else {
            const parentKeys = this.data.nodes.filter(parent => isNodeInside(node, parent)).map(parent => ({ key: parent.id, tooltip: `Parent of ${node.label}` }));
            // TODO obtain the smallest parent
            return this.nodesFrom(parentKeys);
        }
    }

    rootNodes = async () => {
        // Map nodes to check if they are root.
        // NOTE: iterate with for..of + await — a `forEach(async …)` would return
        // before the awaited file-node branches push their result, silently dropping
        // file-based root nodes (and leaking unhandled rejections).
        const rootNodes: FlowNode[] = [];
        const { nodes } = this.data;
        for (const node of nodes) {
            switch (node.type) {
                case "text":
                case "group": {
                    const textNode = YamlService.instance(node.zettelflowConfig);
                    if (textNode.isRoot()) {
                        const flowNode = textNode.getZettelFlowSettings();
                        rootNodes.push(this.populateNode(node, flowNode));
                    }
                    break;
                }
                case "file": {
                    const file = await FileService.getFile(node.file);
                    if (!file) {
                        throw new FatalError(`File ${node.file} not found`);
                    }
                    const fileNode = FrontmatterService.instance(file);
                    if (fileNode.equals("zettelFlowSettings.root", true)) {
                        const flowNode = fileNode.getZettelFlowSettings();
                        rootNodes.push(this.populateNode(node, flowNode));
                    } else if (fileNode.isCacheMiss()) {
                        // MetadataCache race / stale install: fall back to reading raw disk content
                        const settings = await this.readSettingsFromDisk(file);
                        if (settings?.root === true) {
                            rootNodes.push(this.populateNode(node, settings));
                        }
                    }
                    break;
                }
            }
        }
        return rootNodes;
    }

    private async readSettingsFromDisk(file: TFile): Promise<StepSettings | null> {
        try {
            const content = await FileService.getContent(file);
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (!match) return null;
            const parsed = parseYaml(match[1]) as Record<string, unknown>;
            const settings = parsed.zettelFlowSettings as StepSettings | undefined;
            return settings ?? null;
        } catch {
            return null;
        }
    }

    private async nodesFrom(edgeInfo: EdgeInfo[]): Promise<FlowNode[]> {
        // for..of + await (not forEach(async …)) so awaited file-node branches are
        // actually included in the returned array — see the note on rootNodes.
        const flowNodes: FlowNode[] = [];
        for (const edge of edgeInfo) {
            const node = this.nodes.get(edge.key);
            if (node) {
                switch (node.type) {
                    case "text":
                    case "group": {
                        const textNode = YamlService.instance(node.zettelflowConfig);
                        flowNodes.push(this.populateNode(node, textNode.getZettelFlowSettings(), edge.tooltip));
                        break;
                    }
                    case "file": {
                        const file = await FileService.getFile(node.file);
                        if (!file) {
                            throw new FatalError(`File ${node.file} not found`);
                        }
                        switch (file.extension) {
                            case "md": {
                                const fileNode = FrontmatterService.instance(file);
                                flowNodes.push(this.populateNode(node, fileNode.getZettelFlowSettings(), edge.tooltip));
                                break;
                            }
                            case "js": {
                                flowNodes.push(this.populateScriptNode(node, file, edge.tooltip));
                                break;
                            }
                            default:
                                log.warn(`Extension ${node.file} not supported for file ${file.basename}`);
                        }
                        break;
                    }
                }
            }
        }
        return flowNodes;
    }

    private async save() {
        const content = canvasJsonFormatter(this.data);
        await ObsidianApi.vault()
            .modify(this.file, content)
            .catch(error => {
                const errorString = `Error saving canvas on ${this.file.path}: ${error}`;
                log.error(errorString);
                new Notice(errorString);
            });
    }

    private async refresh() {
        const content = await FileService.getContent(this.file);
        this.data = JSON.parse(content) as CanvasData;
    }

    private populateNode(data: CanvasTextData | CanvasFileData | CanvasGroupData, node: StepSettings, tooltip?: string): FlowNode {
        return {
            ...node,
            type: data.type,
            color: getCanvasColor(data.color),
            id: data.id,
            path: data.type === "file" ? data.file : undefined,
            tooltip
        }
    }

    private populateScriptNode(data: CanvasFileData, file: TFile, tooltip?: string): FlowNode {
        const node = {
            ...data,
            root: false,
            actions: [],
            label: `Script: ${file.basename}`,
            color: getCanvasColor(data.color),
            path: file.path,
            tooltip
        }
        this.nodes.set(data.id, node);
        return node;
    }

}
import { ObsidianApi, log } from "architecture";
import { Flow, Flows } from "./typing";
import { CanvasData } from "obsidian/canvas";
import { FileService } from "../services/FileService";
import { Notice, TFile } from "obsidian";

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
    constructor(public data: CanvasData, private file: TFile) { }
    editNode = async (nodeId: string, text: string) => {
        const node = this.data.nodes.find(node => node.id === nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }
        node.text = text;
        await this.save();
    }

    childrensOf = (nodeId: string) => {
        throw new Error("Method not implemented.");
    }
    parentsOf = (nodeId: string) => {
        throw new Error("Method not implemented.");
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
}
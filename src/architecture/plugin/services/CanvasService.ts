import { AllCanvasNodeData, CanvasEdgeData } from "obsidian/canvas";
import { ObsidianApi, log } from "architecture";
import { Notice, TFile } from "obsidian";

type CanvasFileInfo = {
    nodes: AllCanvasNodeData[],
    edges: CanvasEdgeData[],
}

export class CanvasService {
    public static instance(file: TFile, canvasJson: string) {
        const canvas = JSON.parse(canvasJson);
        return new CanvasService(file, canvas);
    }

    constructor(private file: TFile, private canvas: CanvasFileInfo) {
    }

    editEmbedNodeText(nodeId: string, text: string) {
        const node = this.canvas.nodes.find(node => node.id === nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }
        node.text = text;
        return this;
    }

    save(): void {
        ObsidianApi.vault().modify(this.file, JSON.stringify(this.canvas)).catch(error => {
            const errorString = `Error saving canvas on ${this.file.path}: ${error}`;
            log.error(errorString);
            new Notice(errorString);
        });
    }
}
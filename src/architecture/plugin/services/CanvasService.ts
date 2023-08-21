import { ObsidianApi, c } from "architecture";
import { TFile } from "obsidian";
import { CanvasDataInfo, CanvasEdgeDataInfo } from "obsidian/canvas";
import { FrontmatterService } from "./FrontmatterService";
export type CanvasFileTree = {
    file: TFile;
    children: CanvasFileTree[];
}

export class CanvasService {
    public static getCanvasFileTree(data: CanvasDataInfo): CanvasFileTree[] {
        const nodeFiles = Array.from(data.nodes.values()).filter(node => node.file);
        const edges = Array.from(data.edges.values()).filter(edge => edge.from.node.file && edge.to.node.file);
        const rootFiles = nodeFiles.filter(node => FrontmatterService.containsProperty(node.file, "root", true));

        const canvasFileTree: CanvasFileTree[] = [];

        for (const node of rootFiles) {
            canvasFileTree.push({
                file: node.file,
                children: CanvasService.getCanvasFileTreeRecursive(node.file, edges)
            });
        }
        // TODO: Handle circular references
        return canvasFileTree;
    }

    private static getCanvasFileTreeRecursive(from: TFile, edges: CanvasEdgeDataInfo[]): CanvasFileTree[] {
        const children: CanvasFileTree[] = [];
        const childrenEdges = edges.filter(edge => edge.from.node.file?.path === from.path);
        for (const edge of childrenEdges) {
            const to = edge.to.node.file;
            if (to) {
                children.push({
                    file: to,
                    children: CanvasService.getCanvasFileTreeRecursive(to, edges)
                });
            }
        }
        return children;
    }
}
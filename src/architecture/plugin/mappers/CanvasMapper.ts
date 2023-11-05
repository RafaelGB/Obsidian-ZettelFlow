import { HexString } from "obsidian";
import { CanvasDataInfo, CanvasEdgeDataInfo } from "obsidian/canvas";
import { FrontmatterService } from "../services/FrontmatterService";
import { RGB2String, hex2RGB } from "architecture";
import { ZettelNode, ZettelNodeSource } from "../model/CanvasModel";

export class CanvasMapper {
    public static instance(data: CanvasDataInfo) {
        return new CanvasMapper(data);
    }
    constructor(private data: CanvasDataInfo) { }
    public getCanvasFileTree(): ZettelNodeSource[] {
        const { nodes, edges } = this.data;
        const nodeFiles = Array.from(nodes.values()).filter(node => node.file);
        const filteredEdges = Array.from(edges.values()).filter(edge => edge.from.node.file && edge.to.node.file);
        const rootFiles = nodeFiles.filter(node => FrontmatterService.instance(node.file).equals("zettelFlowSettings.root", true));
        const rootNodes: ZettelNodeSource[] = [];

        for (const node of rootFiles) {
            const { file, id, color } = node;
            rootNodes.push({
                id,
                file,
                color: this.getCanvasColor(color),
                children: this.getCanvasFileTreeRecursive(id, filteredEdges, [id])
            });
        }
        return rootNodes;
    }

    private getCanvasFileTreeRecursive(from: string, edges: CanvasEdgeDataInfo[], previousNodes: string[]): ZettelNode[] {
        const nodes: ZettelNode[] = [];
        const childrenEdges = edges.filter(edge => edge.from.node.id === from);
        for (const edge of childrenEdges) {
            const { id, color, file } = edge.to.node;
            if (previousNodes.includes(id)) {
                nodes.push({
                    id
                });
            }
            else if (file) {
                nodes.push({
                    id,
                    file,
                    tooltip: edge.label,
                    color: this.getCanvasColor(color),
                    children: this.getCanvasFileTreeRecursive(id, edges, [...previousNodes, id])
                });

            }
        }
        return nodes;
    }
    private getCanvasColor(color: HexString) {
        return !color
            ? "var(--embed-background)"
            : color.length === 1
                ? `var(--canvas-color-${color})`
                : RGB2String(hex2RGB(color.substring(1))
                )
    }
}
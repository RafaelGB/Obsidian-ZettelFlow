import { HexString, TFile } from "obsidian";
import { CanvasDataInfo, CanvasEdgeDataInfo, CanvasFileData, CanvasTextData } from "obsidian/canvas";
import { FrontmatterService } from "../../services/FrontmatterService";
import { RGB2String, hex2RGB } from "architecture";
import { ZettelNode, ZettelNodeSource } from "../../model/CanvasModel";

export class CanvasMapper {
    public static instance(data: CanvasDataInfo) {
        return new CanvasMapper(data);
    }
    constructor(private data: CanvasDataInfo) { }
    public getCanvasFileTree(): ZettelNodeSource[] {
        const rootNodes: ZettelNodeSource[] = [];
        rootNodes.push(...this.getCanvasFileNodes());
        return rootNodes;
    }

    private getCanvasFileNodes(): ZettelNodeSource[] {
        const { nodes, edges } = this.data;
        const arrayNodes = Array.from(nodes.values());
        const nodeFiles: CanvasFileData[] = arrayNodes
            .filter(node => node.file)
            .map(node => {
                node.type = "file";
                return node as CanvasFileData
            });

        const textNodes = arrayNodes.filter(node => typeof node.text === "string").map(node => {
            node.type = "text";
            return node as CanvasTextData
        });
        console.log(textNodes);

        const filteredEdges = Array.from(edges.values()).filter(edge => edge.from.node.file && edge.to.node.file);
        const rootFiles = nodeFiles.filter(async node => {
            if (!node.file)
                return false;
            return FrontmatterService.instance(node.file as unknown as TFile).equals("zettelFlowSettings.root", true);
        });
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



    private getCanvasColor(color: HexString | undefined) {
        return !color
            ? "var(--embed-background)"
            : color.length === 1
                ? `var(--canvas-color-${color})`
                : RGB2String(hex2RGB(color.substring(1))
                )
    }
}
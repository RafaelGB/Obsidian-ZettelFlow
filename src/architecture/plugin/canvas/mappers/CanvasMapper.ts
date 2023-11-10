import { HexString } from "obsidian";
import { CanvasDataInfo, CanvasEdgeDataInfo } from "obsidian/canvas";
import { FrontmatterService } from "../../services/FrontmatterService";
import { RGB2String, hex2RGB } from "architecture";
import { ZettelNode } from "../../model/CanvasModel";
import { YamlService } from "architecture/plugin";

export class CanvasMapper {
    public static instance(data: CanvasDataInfo) {
        return new CanvasMapper(data);
    }
    constructor(private data: CanvasDataInfo) { }
    public getCanvasFileTree(): ZettelNode[] {
        const { nodes, edges } = this.data;
        const relevantNodes = Array.from(nodes.values()).filter(node => node.file || node.text);

        const filteredEdges = Array.from(edges.values()).filter(edge => (edge.from.node.file || edge.from.node.text) && (edge.to.node.file || edge.to.node.text));
        const rootFiles = relevantNodes
            .filter(node => {
                if (node.text) {
                    return YamlService.instance(node.text).isRoot();
                }
                if (node.file) {
                    return FrontmatterService.instance(node.file).equals("zettelFlowSettings.root", true);
                }
                return false;
            });
        const rootNodes: ZettelNode[] = [];

        for (const node of rootFiles) {
            const { file, text, id, color, type } = node;
            rootNodes.push({
                id,
                type,
                file,
                text,
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
            const { id, color, file, text, type } = edge.to.node;
            if (previousNodes.includes(id)) {
                nodes.push({
                    id,
                    type,
                });
            }
            else if (file || text) {
                nodes.push({
                    id,
                    type,
                    file,
                    text,
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
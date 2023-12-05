import { CanvasData } from "obsidian/canvas";

export function canvasJsonFormatter(data: CanvasData) {
    const nodesFormatted = data.nodes.map((node: any) => JSON.stringify(node));
    const edgesFormatted = data.edges.map((edge: any) => JSON.stringify(edge));

    return `{\n\t"nodes":[\n\t\t${nodesFormatted.join(",\n\t\t")}\n\t],\n\t"edges":[\n\t\t${edgesFormatted.join(",\n\t\t")}\n\t]\n}`;
}
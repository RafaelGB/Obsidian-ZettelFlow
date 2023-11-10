import { ItemView } from "obsidian";
import "obsidian/canvas";

declare module "obsidian/canvas" {
    interface CanvasDataInfo {
        nodes: Map<number, AllCanvasNodeData>;
        edges: Map<number, CanvasEdgeDataInfo>;
    }

    abstract class CanvasView extends ItemView {
        canvas: CanvasDataInfo;
    }

    interface CanvasEdgeDataInfo {
        from: CanvasNode;
        to: CanvasNode;
        label: string;
        id: string;
    }

    interface CanvasNode {
        node: AllCanvasNodeData;
    }
}
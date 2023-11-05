import { HexString, ItemView, TFile } from "obsidian";
import "obsidian/canvas";

declare module "obsidian/canvas" {
    type AllCanvasNode = CanvasFileNode;



    interface CanvasDataInfo {
        nodes: Map<number, AllCanvasNode>;
        edges: Map<number, CanvasEdgeDataInfo>;
    }

    interface CanvasFileNode extends CanvasNodeInfo {
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
        node: CanvasNodeInfo;
    }
    interface CanvasNodeInfo {
        file: TFile;
        color: HexString;
        id: string;
    }
}
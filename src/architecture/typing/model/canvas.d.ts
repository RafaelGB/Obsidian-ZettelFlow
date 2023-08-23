import { ItemView, TFile } from "obsidian";
import "obsidian/canvas";

declare module "obsidian/canvas" {
    type AllCanvasNode = CanvasFileNode;



    interface CanvasDataInfo {
        nodes: Map<number, AllCanvasNode>;
        edges: Map<number, CanvasEdgeDataInfo>;
    }

    interface CanvasNode {

    }

    interface CanvasFileNode extends CanvasNode {
        file: TFile;
    }

    abstract class CanvasView extends ItemView {
        canvas: CanvasDataInfo;
    }

    interface CanvasEdgeDataInfo {
        from: CanvasNode;
        to: CanvasNode;
    }

    interface CanvasNode {
        node: CanvasNodeInfo;
    }
    interface CanvasNodeInfo {
        file: TFile;
    }
}
import { FlowsImpl } from "./Flows";
import { Canvas, Flows } from "./typing";

class CanvasImpl implements Canvas {
    private static instance: CanvasImpl;
    flows: Flows;
    constructor() {
        this.flows = new FlowsImpl();
    }
    public static getInstance(): CanvasImpl {
        if (!CanvasImpl.instance) {
            CanvasImpl.instance = new CanvasImpl();
        }
        return CanvasImpl.instance;
    }
}

export const canvas = CanvasImpl.getInstance();
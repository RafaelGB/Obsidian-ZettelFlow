import { FlowsImpl } from "./Flows";
import { Canvas, Flows } from "./typing";

export class CanvasImpl implements Canvas {
    flows: Flows;
    constructor() {
        this.flows = new FlowsImpl();
    }

}
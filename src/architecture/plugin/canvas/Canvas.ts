import { StepSettings } from "zettelkasten";
import { FlowsImpl } from "./Flows";
import { Canvas, CanvasClipboard, Flows } from "./typing";

class CanvasImpl implements Canvas {
    private static instance: CanvasImpl;
    private savedSettings: StepSettings | undefined;
    flows: Flows;

    clipboard: CanvasClipboard = {
        save: (settings: StepSettings) => {
            this.savedSettings = settings;
        },
        get: () => {
            return this.savedSettings;
        },
        clear: () => {
            delete this.savedSettings;
        }
    }

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
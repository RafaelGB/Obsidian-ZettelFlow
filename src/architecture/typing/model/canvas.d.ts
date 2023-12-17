import "obsidian/canvas";

declare module "obsidian/canvas" {
    interface CanvasTextData extends CanvasNodeData {
        type: 'text';
        text: string;
        unknownData: {
            zettelflowConfig?: string;
            [key: string]: any;
        };
        zettelflowConfig: string;
    }
}
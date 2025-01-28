import ZettelFlow from "main";
export interface ZComponent {
    onLoad(): void;
    onUnload(): void;
}

export abstract class PluginComponent implements ZComponent {
    constructor(_plugin: ZettelFlow) { }
    abstract onLoad(): void;
    onUnload(): void { }
}

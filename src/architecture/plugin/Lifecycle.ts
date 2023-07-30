import { Plugin } from "obsidian";
export interface ZComponent{
    onLoad():void;
    onUnload():void;
}

export abstract class PluginComponent implements ZComponent{
    constructor(plugin:Plugin){}
    abstract onLoad():void;
    onUnload():void{}
}

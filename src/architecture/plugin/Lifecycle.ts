import ZettlelFlow from "main";
export interface ZComponent{
    onLoad():void;
    onUnload():void;
}

export abstract class PluginComponent implements ZComponent{
    constructor(plugin:ZettlelFlow){}
    abstract onLoad():void;
    onUnload():void{}
}

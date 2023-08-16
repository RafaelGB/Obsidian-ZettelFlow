import { PluginComponent } from "architecture";

class ZComponentsManagerService {
    private static instance: ZComponentsManagerService;
    private liveCycleComponents: PluginComponent[];
    constructor() { 
        this.liveCycleComponents = [];
    }

    public registerComponent(component:PluginComponent):void{
        this.liveCycleComponents.push(component);
    }

    public loadComponents():void{
        this.liveCycleComponents.forEach(component => {
            component.onLoad();
        });
    }

    public unloadComponents():void{
        this.liveCycleComponents.forEach(component => {
            component.onUnload();
        });
        this.liveCycleComponents = [];
    }

    public static getInstance(): ZComponentsManagerService {
        if (!ZComponentsManagerService.instance) {
            ZComponentsManagerService.instance = new ZComponentsManagerService();
        }
        return ZComponentsManagerService.instance;
    }
}

export const ZComponentsManager = ZComponentsManagerService.getInstance();


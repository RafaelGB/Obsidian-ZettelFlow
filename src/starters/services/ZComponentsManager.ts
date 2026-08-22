import { PluginComponent, log } from "architecture";

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
        // Isolate each component: one throwing onLoad must not abort the rest (and must not bubble
        // up to Plugin.onload, which would leave core views/commands unregistered). The failure is
        // logged so the offending component is visible, and every other component still loads.
        this.liveCycleComponents.forEach(component => {
            try {
                component.onLoad();
            } catch (error) {
                log.error(`[ZComponents] component "${component.constructor.name}" failed to load`, error);
            }
        });
    }

    public unloadComponents():void{
        this.liveCycleComponents.forEach(component => {
            try {
                component.onUnload();
            } catch (error) {
                log.error(`[ZComponents] component "${component.constructor.name}" failed to unload`, error);
            }
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


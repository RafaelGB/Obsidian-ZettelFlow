import "obsidian";
import { AllCanvasNodeData } from "obsidian/canvas";
declare module "obsidian" {
    interface setting {
        open: () => void;
        openTabById: (id: string) => void;
    }
    interface App {
        setting: setting;
        commands: {
            executeCommandById: (id: string) => void;
        }
        // Out of official API
        dom: {
            appContainerEl: HTMLElement;
        }
        plugins: {
            getPlugin(pluginId: string): any | null;
        }
    }
    interface Workspace {
        on(name: "canvas:node-menu", callback: (menu: Menu, node: AllCanvasNodeData) => void): EventRef;
    }
    interface MetadataCache {
        /**
         * Obtain the tags of all the vault with their count.
         * 
         * WARNING! not exposed by Obsidian, may break in future.
         */
        getTags(): Record<string, number>;
    }
}
import "obsidian";
import { AllCanvasNodeData, Canvas } from "obsidian/canvas";
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
        // Out of official API but used in the codebase
        on(name: "canvas:node-menu", callback: (menu: Menu, node: AllCanvasNodeData) => void): EventRef;
        // Monkey patching
        on(name: "canvas:popup-menu", callback: (canvas: Canvas) => void): EventRef;
    }

    interface MetadataCache {
        /**
         * Obtain the tags of all the vault with their count.
         * 
         * WARNING! not exposed by Obsidian, may break in future.
         */
        getTags(): Record<string, number>;

        /**
         *  Obtain the values associated with a given frontmatter key.
         * 
         * WARNING! not exposed by Obsidian, may break in future.
         * @param key The key to search for.
         */
        getFrontmatterPropertyValuesForKey(key: string): string[];
    }
}
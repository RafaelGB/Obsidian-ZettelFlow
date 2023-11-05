import "obsidian";

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
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
    }
}
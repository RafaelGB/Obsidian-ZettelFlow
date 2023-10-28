import { App, FileManager, Keymap, MetadataCache, Vault, Workspace } from "obsidian";

export class ObsidianAPIService {
    private static instance: ObsidianAPIService;
    private app: App;
    public static init(app: App): ObsidianAPIService {
        ObsidianAPIService.getInstance().app = app;
        return ObsidianAPIService.getInstance();
    }
    public vault(): Vault {
        return this.app.vault;
    }

    public workspace(): Workspace {
        return this.app.workspace;
    }

    public fileManager(): FileManager {
        return this.app.fileManager;
    }

    public keymap(): Keymap {
        return this.app.keymap;
    }

    public metadataCache(): MetadataCache {
        return this.app.metadataCache;
    }

    public executeCommandById(id: string) {
        this.app.commands.executeCommandById(id);
    }

    public getPluginApp(): App {
        return this.app;
    }

    public static getInstance(): ObsidianAPIService {
        if (!ObsidianAPIService.instance) {
            ObsidianAPIService.instance = new ObsidianAPIService();
        }
        return ObsidianAPIService.instance;
    }
}

export const ObsidianApi = ObsidianAPIService.getInstance();


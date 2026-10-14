import { log } from "architecture";
import ZettelFlow from "main";
import { App, FileManager, Keymap, MetadataCache, Plugin, Vault, Workspace } from "obsidian";

export class ObsidianAPIService {
    private static instance: ObsidianAPIService;
    private app: App;
    public static init(app: App): ObsidianAPIService {
        ObsidianAPIService.getInstance().app = app;
        log.info('ObsidianAPIService loaded');
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

    /**
     * Obsidian's per-vault local storage (#798): what this device remembers about this vault and
     * nowhere else — never `data.json`, never the Adapter.
     */
    public loadLocal(key: string): unknown {
        return this.app?.loadLocalStorage?.(key) ?? null;
    }

    public saveLocal(key: string, value: unknown): void {
        this.app?.saveLocalStorage?.(key, value);
    }

    public globalApp(): App {
        return this.app;
    }

    public getOwnPlugin(): ZettelFlow {
        return this.app.plugins.getPlugin('zettelflow') as ZettelFlow;
    }

    public getExternalPlugin(pluginId: string): Plugin | null {
        return this.app.plugins.getPlugin(pluginId);
    }

    public static getInstance(): ObsidianAPIService {
        if (!ObsidianAPIService.instance) {
            ObsidianAPIService.instance = new ObsidianAPIService();
        }
        return ObsidianAPIService.instance;
    }
}

export const ObsidianApi = ObsidianAPIService.getInstance();


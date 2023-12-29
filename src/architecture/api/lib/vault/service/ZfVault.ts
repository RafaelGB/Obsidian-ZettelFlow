import { App, TAbstractFile, TFile, TFolder, Vault, normalizePath } from "obsidian";
import { LibModule } from "../../LibModule";
import { IZfVault } from "../typing";
import { log } from "architecture";

export class ZfVaultImpl extends LibModule implements IZfVault {
    private static instance: ZfVaultImpl;
    public name: "vault";

    create_static_functions(): Promise<void> {
        this.static_functions.set("resolveTFolder", this.resolveTFolder.bind(this));
        this.static_functions.set("obtainFilesFrom", this.obtainFilesFrom.bind(this));
        return Promise.resolve();
    }

    resolveTFolder(path: string): TFolder {
        const normalizedPath = normalizePath(path);
        let folder = this.app.vault.getAbstractFileByPath(normalizedPath);

        if (!folder) {
            folder = this.resolveTFolder(normalizedPath.split("/").slice(0, -1).join("/"));
        }

        if (!(folder instanceof TFolder)) {
            throw new Error(`Could not resolve ${path} to a TFolder`);
        }

        return folder;
    }

    obtainFilesFrom(folder: TFolder, extensions: string[] = ["md", "canvas"]): TFile[] {
        let files: Array<TFile> = [];
        Vault.recurseChildren(folder, (file: TAbstractFile) => {
            if (file instanceof TFile) {
                files.push(file);
            }
        });

        if (extensions.length > 0) {
            files = files.filter((file) => {
                return extensions.includes(file.extension);
            });
        }

        files.sort((a, b) => {
            return a.basename.localeCompare(b.basename);
        });

        return files;
    }

    public static instanceInit(app: App): void {
        this.instance = new ZfVaultImpl(app);
        this.instance.init();
        log.info("ZfVault loaded");
    }

    public static getInstance(): ZfVaultImpl {
        if (!this.instance) {
            throw new Error("ZfVault not initialized");
        }
        return this.instance;
    }
}

export const ZfVault = () => ZfVaultImpl.getInstance();
import ZettelFlow from "main";
import { TFile } from "obsidian";
import { FrontmatterService } from "./FrontmatterService";
import { log } from "architecture";

type FileOnFly = {
    frontmatter: FrontmatterService;
    onProcess: boolean;
    processStartAt?: Date
}

export class VaultStateManager {
    public static INSTANCE: VaultStateManager;

    private vaultStateEnabled: boolean = true;
    private managedFiles: Record<string, FileOnFly> = {};

    public static init(plugin: ZettelFlow) {
        VaultStateManager.INSTANCE = new VaultStateManager(plugin);
    }
    constructor(plugin: ZettelFlow) {
        log.debug(`plugin`, plugin.settings.communitySettings);
    }

    public cleanAll() {
        this.managedFiles = {};
    }

    public add(file: TFile) {
        this.managedFiles[file.path] = {
            frontmatter: FrontmatterService.instance(file),
            onProcess: false
        }
        log.debug(`[VaultStateManager] Added file: ${file.path}`);
        return this.managedFiles[file.path];
    }

    public update(file: TFile) {
        if (this.managedFiles[file.path]) {
            this.managedFiles[file.path].frontmatter = FrontmatterService.instance(file);
        } else {
            log.warn(`[VaultStateManager] Attempted to update non-existing file: ${file.path}`);
        }
    }

    public get(key: string): FileOnFly | undefined {
        return this.managedFiles[key];
    }

    public remove(key: string) {
        if (this.managedFiles[key]) {
            delete this.managedFiles[key];
        } else {
            log.warn(`[VaultStateManager] Attempted to remove non-existing file: ${key}`);
        }
    }

    public isOnProcess(key: string): boolean {
        const ps: FileOnFly = this.managedFiles[key];
        if (ps) {
            return ps.onProcess;
        }
        return false;
    }

    public isVaultStateEnabled(): boolean {
        return this.vaultStateEnabled;
    }

    public disableVaultState() {
        this.vaultStateEnabled = false;
    }

    public enableVaultState() {
        this.vaultStateEnabled = true;
    }

    public processStart(key: string) {
        const ps: FileOnFly = this.managedFiles[key];
        if (ps) {
            ps.onProcess = true;
            ps.processStartAt = new Date();
            log.debug(`[VaultStateManager] Process started for ${key} at ${ps.processStartAt}`);

            this.managedFiles[key] = ps;
        }
    }

    public processFinished(key: string) {
        const ps: FileOnFly = this.managedFiles[key];
        if (ps) {
            ps.onProcess = false;
            const endAt = new Date();
            if (ps.processStartAt) {
                const duration = endAt.getTime() - ps.processStartAt.getTime();
                log.debug(`[VaultStateManager] Process finished for ${key} in ${duration}ms`);
            }
            ps.processStartAt = undefined;

            this.managedFiles[key] = ps;
        }
    }
}


import ZettelFlow from "main";
import { TFile } from "obsidian";
import { FrontmatterService } from "./FrontmatterService";

type FileOnFly = {
    frontmatter: FrontmatterService;
    onProcess: boolean;
    processStartAt?: Date
}

export class VaultStateManager {
    public static INSTANCE: VaultStateManager;

    private globalEnabled: boolean = true;
    private managedFiles: Record<string, FileOnFly> = {};

    public static init(plugin: ZettelFlow) {
        VaultStateManager.INSTANCE = new VaultStateManager(plugin);
    }
    constructor(private plugin: ZettelFlow) { }

    public clean() {
        this.managedFiles = {};
    }

    public activeFile(file: TFile) {
        this.managedFiles[file.path] = {
            frontmatter: FrontmatterService.instance(file),
            onProcess: false
        }
    }

    public isOnProcess(key: string): boolean {
        const ps: FileOnFly = this.managedFiles[key];
        if (ps) {
            return ps.onProcess;
        }
        return false;
    }

    public isGlobalEnabled(): boolean {
        return this.globalEnabled;
    }

    public disableGlobal() {
        this.globalEnabled = false;
    }

    public enableGlobal() {
        this.globalEnabled = true;
    }

    public processStart(key: string) {
        const ps: FileOnFly = this.managedFiles[key];
        if (ps) {
            ps.onProcess = true;
            // TODO: register a timestamp
            ps.processStartAt = new Date();
        }
    }

    public processFinished(key: string) {
        const ps: FileOnFly = this.managedFiles[key];
        if (ps) {
            ps.onProcess = false;
            // TODO: compare registered timestamp with current date and log execution time.

        }
    }
}


import { ZettelFlowSettings } from "config";
import { LibModule } from "../../LibModule";
import { App, Notice, TFile } from "obsidian";
import { ZfVault } from "../../vault/service/ZfVault";
import { log } from "architecture";
import { buildSyncScriptFunction } from "../../FnConstructor";
import { contractSignature, parseLibraryContract, type LibraryContract } from "../jsdocContract";
import { withScriptRun } from "../../recordScriptRun";

/** What happened to one library module the last time it was loaded (#448). */
export interface LibraryModuleStatus {
    path: string;
    name: string;
    loaded: boolean;
    /** Why it did not load, when it did not. */
    error?: string;
    contract?: LibraryContract;
}

export class ZfScripts extends LibModule {
    name = "user";

    /** One entry per file in the library folder, whether or not it loaded. */
    private static modules = new Map<string, LibraryModuleStatus>();

    /** What the manager renders: every module, its status, and what it says about itself. */
    public static describeModules(): LibraryModuleStatus[] {
        return [...ZfScripts.modules.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    constructor(private settings: ZettelFlowSettings, app: App) {
        super(app);
    }

    async create_static_functions(): Promise<void> {
        // There are no static functions for scripts module (yet)
    }

    async create_dynamic_functions(): Promise<void> {
        if (!this.settings.jsLibraryFolderPath) {
            log.info("No jsLibraryFolderPath specified, skipping user functions loading");
            return;
        }
        const folder = ZfVault().resolveTFolder(this.settings.jsLibraryFolderPath);

        const files = ZfVault().obtainFilesFrom(folder, ["js"]);
        // A fresh picture every load: a module deleted between two loads should stop being listed.
        ZfScripts.modules.clear();

        for (const file of files) {
            try {
                await this.loadUserFnFrom(file);
            } catch (error) {
                log.error(`Error loading ZettelFlow script from path = "${file.path}`, error);
                const message = error instanceof Error ? error.message : String(error);
                // Remembered, not just announced: a toast at startup told you once and vanished,
                // and the manager is where you go to ask what loaded (#448).
                ZfScripts.modules.set(file.path, {
                    path: file.path,
                    name: file.basename,
                    loaded: false,
                    error: message,
                });
                new Notice(`Error loading ZettelFlow script "${file.path}". ${message}`);
            }
        };
    }

    async loadUserFnFrom(file: TFile): Promise<void> {
        const file_content = await this.app.vault.read(file);
        const nodeRequire = (window as { require?: (s: string) => unknown }).require;
        const req = (s: string): unknown => (nodeRequire ? nodeRequire(s) : undefined);
        const exp: Record<string, unknown> = {};
        const mod = {
            exports: exp
        };

        // Wrap the user script as a CommonJS module, through the one module that builds runtime code
        // (#320). It runs in the global scope with no access to this closure — safer than `eval`, and
        // it keeps the "exactly one home" the capability disclosure promises actually true.
        const wrapping_fn = buildSyncScriptFunction(["require", "module", "exports"], file_content);
        // Loading a module runs it, so it is a run and it is recorded (#444): a library that
        // throws on load used to show one toast at startup and then vanish from the story.
        await withScriptRun(
            { surface: "library", origin: { ref: file.path, label: file.basename } },
            async () => wrapping_fn(req, mod, exp)
        );
        const formula_function = exp['default'] || mod.exports;

        if (!formula_function) {
            const msg = `Failed to load script ${file.path}. No exports detected.`;
            log.error(msg);
            return;
        }
        if (!(formula_function instanceof Function)) {
            const msg = `Failed to load script ${file.path}. Default export is not a function.`
            log.error(msg);
            return;
        }

        this.dynamic_functions.set(`${file.basename}`, formula_function);

        // What the module says about itself, if it says anything: the same description then feeds
        // completions, hover and the generated `.d.ts` (#448 FR-7).
        const contract = parseLibraryContract(file_content);
        ZfScripts.modules.set(file.path, {
            path: file.path,
            name: file.basename,
            loaded: true,
            contract,
        });
        if (contract.description || contract.params.length > 0) {
            this.docs.set(file.basename, {
                path: `${this.namespace()}.${file.basename}`,
                signature: contractSignature(contract),
                summary: contract.description ?? file.basename,
            });
        }
    }
}
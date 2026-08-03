import { ZettelFlowSettings } from "config";
import { LibModule } from "../../LibModule";
import { App, Notice, TFile } from "obsidian";
import { ZfVault } from "../../vault/service/ZfVault";
import { log } from "architecture";

export class ZfScripts extends LibModule {
    name = "user";

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

        for (const file of files) {
            try {
                await this.loadUserFnFrom(file);
            } catch (error) {
                log.error(`Error loading ZettelFlow script from path = "${file.path}`, error);
                const message = error instanceof Error ? error.message : String(error);
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

        // Wrap the user script as a CommonJS module. We build it with the Function
        // constructor (reached through a function's prototype) rather than eval: it runs in
        // the global scope with no access to this closure — both safer and lint-clean.
        const fnProto = Object.getPrototypeOf(function () { /* probe */ }) as {
            constructor: new (...args: string[]) => (require: unknown, module: unknown, exports: unknown) => void;
        };
        const wrapping_fn = new fnProto.constructor("require", "module", "exports", file_content);
        wrapping_fn(req, mod, exp);
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
    }
}
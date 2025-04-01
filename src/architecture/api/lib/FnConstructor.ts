import { log } from "architecture";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { ZfScripts, ZfVault } from "architecture/api";
import { TemplaterTools, ZettelFlowApp, ZfExternalTools, ZfInternalTools } from "./typing";

async function buildExternalTools(): Promise<ZfExternalTools> {
    const externaFns: ZfExternalTools = {};
    // TEMPLATER
    const templaterPlugin = ObsidianApi.getExternalPlugin("templater-obsidian");

    if (templaterPlugin) {
        const templater: TemplaterTools = {
            user: await templaterPlugin.templater.functions_generator.user_functions.user_script_functions.generate_object()
        };
        log.info("Templater plugin found, adding templater functions to the API");
        externaFns.tp = templater;
    }

    // DATAVIEW
    const dataviewPlugin = ObsidianApi.getExternalPlugin("dataview");
    if (dataviewPlugin) {
        log.info("Dataview plugin found, adding dataview functions to the API");
        externaFns.dv = dataviewPlugin.api;
    }

    return externaFns;
}

async function buildInternalTools(): Promise<ZfInternalTools> {
    const app = ObsidianApi.globalApp();
    const settings = ObsidianApi.getOwnPlugin().settings;
    const zfVaultFns = await ZfVault().generate_object();

    const zfScript = new ZfScripts(settings, app);
    const zfScriptsFns = await zfScript.generate_object();

    const internalFns: ZfInternalTools = {
        vault: zfVaultFns,
        user: zfScriptsFns
    };

    return internalFns;
}

async function buildTools(): Promise<ZettelFlowApp> {
    const fns: ZettelFlowApp = {
        external: await buildExternalTools(),
        internal: await buildInternalTools()
    };
    return fns;
};


class FnsManager {
    private static instance: FnsManager;
    private cache: Promise<ZettelFlowApp> | null = null;

    private constructor() { }

    public static getInstance(): FnsManager {
        if (!FnsManager.instance) {
            FnsManager.instance = new FnsManager();
        }
        return FnsManager.instance;
    }

    public getFns(): Promise<ZettelFlowApp> {
        if (!this.cache) {
            this.cache = buildTools();
        }
        return this.cache;
    }

    public invalidateCache() {
        this.cache = null;
    }
}

export const fnsManager = FnsManager.getInstance();
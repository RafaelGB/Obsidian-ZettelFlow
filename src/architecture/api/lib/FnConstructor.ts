import { log } from "architecture";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { ZfScripts, ZfVault } from "architecture/api";
import { ZettelFlowSettings } from "config";

export async function externalFns(settings: ZettelFlowSettings): Promise<Record<string, unknown>> {
    const fns: Record<string, unknown> = {};
    const app = ObsidianApi.getPluginApp();

    // ZettelFlow external
    const externaFns: Record<string, unknown> = {};
    // TEMPLATER
    const templaterPlugin = ObsidianApi.getExternalPlugin("templater-obsidian");
    if (templaterPlugin) {
        log.info("Templater plugin found, adding templater functions to the API");
        const templaterFns: Record<string, unknown> = {};
        templaterFns["user"] = await templaterPlugin.templater.functions_generator.user_functions.user_script_functions.generate_object();
        externaFns["tp"] = templaterFns;
    }

    // DATAVIEW
    const dataviewPlugin = ObsidianApi.getExternalPlugin("dataview");
    if (dataviewPlugin) {
        log.info("Dataview plugin found, adding dataview functions to the API");
        externaFns["dv"] = dataviewPlugin.api;
    }

    fns["external"] = externaFns;

    // ZettelFlow internal
    const internalFns: Record<string, unknown> = {};

    const zfVaultFns = ZfVault().generate_object();
    internalFns["vault"] = zfVaultFns;


    const zfScript = new ZfScripts(settings, app);
    const zfScriptsFns = await zfScript.generate_object();
    internalFns["user"] = zfScriptsFns;

    fns["internal"] = internalFns;
    return fns;
};
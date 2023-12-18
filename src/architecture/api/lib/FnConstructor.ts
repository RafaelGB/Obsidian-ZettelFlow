import { log } from "architecture";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";

export async function externalFns(): Promise<Record<string, unknown>> {
    const fns: Record<string, unknown> = {};

    // TEMPLATER
    const templaterPlugin = ObsidianApi.getExternalPlugin("templater-obsidian");
    if (templaterPlugin) {
        log.info("Templater plugin found, adding templater functions to the API");
        const templaterFns: Record<string, unknown> = {};
        templaterFns["user"] = await templaterPlugin.templater.functions_generator.user_functions.user_script_functions.generate_object();
        fns["tp"] = templaterFns;
    }

    // DATAVIEW
    const dataviewPlugin = ObsidianApi.getExternalPlugin("dataview");
    if (dataviewPlugin) {
        log.info("Dataview plugin found, adding dataview functions to the API");
        fns["dv"] = dataviewPlugin.api;
    }

    return fns;
};
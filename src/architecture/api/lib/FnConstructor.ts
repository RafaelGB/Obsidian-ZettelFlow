import { ObsidianApi } from "architecture/plugin/ObsidianAPI";

export async function externalFns(): Promise<Record<string, unknown>> {
    const fns: Record<string, unknown> = {};

    // TEMPLATER
    const templaterPlugin = ObsidianApi.getExternalPlugin("templater-obsidian");
    if (templaterPlugin) {
        const templaterFns: Record<string, unknown> = {};
        templaterFns["user"] = await templaterPlugin.templater.functions_generator.user_functions.user_script_functions.generate_object();
        fns["tp"] = templaterFns;
    }

    // DATAVIEW
    const dataviewPlugin = ObsidianApi.getExternalPlugin("dataview");
    if (dataviewPlugin) {
        fns["dv"] = dataviewPlugin.api;
    }

    return fns;
};
import { log } from "architecture";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { ZfScripts, ZfVault } from "architecture/api";
import { DataviewPlugin, TemplaterPlugin, TemplaterTools, ZettelFlowApp, ZfExternalTools, ZfInternalTools } from "./typing";
import { Notice } from "obsidian";

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** An async function built at runtime from a user-provided script body. */
export type AsyncScriptFunction = (...args: unknown[]) => Promise<unknown>;

/**
 * Build an async function from a user-provided script body, the way the note-builder
 * actions and vault hooks run JS. The AsyncFunction constructor isn't exposed on the
 * global scope, so it is reached through the prototype of an async function. Typing it
 * here keeps every call site free of unsafe `any`.
 */
export function buildAsyncScriptFunction(argNames: string[], body: string): AsyncScriptFunction {
    const asyncProto = Object.getPrototypeOf(async function () { }) as {
        constructor: new (...args: string[]) => AsyncScriptFunction;
    };
    const AsyncFunction = asyncProto.constructor;
    return new AsyncFunction(...argNames, body);
}

async function buildExternalTools(): Promise<ZfExternalTools> {
    const externaFns: ZfExternalTools = {};
    // TEMPLATER
    try {
        const templaterPlugin = ObsidianApi.getExternalPlugin("templater-obsidian") as TemplaterPlugin | null;

        if (templaterPlugin) {
            const templater: TemplaterTools = {
                user: await templaterPlugin.templater.functions_generator.user_functions.user_script_functions.generate_object()
            };
            log.info("Templater plugin found, adding templater functions to the API");
            externaFns.tp = templater;
        }
    } catch (error) {
        delete externaFns.tp;
        log.error("Error loading external tools: Templater", error);
        new Notice("Error loading templater JS files: " + errorMessage(error));
    }

    // DATAVIEW
    try {
        const dataviewPlugin = ObsidianApi.getExternalPlugin("dataview") as DataviewPlugin | null;
        if (dataviewPlugin) {
            log.info("Dataview plugin found, adding dataview functions to the API");
            externaFns.dv = dataviewPlugin.api;
        }
    } catch (error) {
        delete externaFns.dv;
        log.error("Error loading external tools: Dataview", error);
        new Notice("Error loading dataview JS files: " + errorMessage(error));
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
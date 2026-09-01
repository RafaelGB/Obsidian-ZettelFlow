/**
 * This module is the **only** place in ZettelFlow that reaches a function constructor (#340, #320).
 *
 * Neither `Function` nor `AsyncFunction` is exposed globally, so both are reached through the prototype
 * of a literal function. Keeping that in one module gives the dynamic-execution capability the Obsidian
 * scan reports exactly one home to disclose and one place to audit, and keeps every call site free of
 * unsafe `any`. A guardrail test fails the build if a second site starts building functions on its own.
 *
 * That was previously true of *async* functions only, while `ZfScripts` quietly built a synchronous one
 * to wrap library modules — so the "exactly one module" claim the capability disclosure makes to users
 * could be disproved with a single grep. Both go through here now.
 */

import { log } from "architecture";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { ZfScripts, ZfVault } from "architecture/api";
import { DataviewPlugin, TemplaterPlugin, TemplaterTools, ZettelFlowApp, ZfExternalTools, ZfInternalTools } from "./typing";
import { ZfKnowledge } from "./knowledge/service/ZfKnowledge";
import { ZfAi } from "./ai/service/ZfAi";
import type { ApiMemberDoc } from "./LibModule";
import { App, Notice } from "obsidian";

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** An async function built at runtime from a user-provided script body. */
export type AsyncScriptFunction = (...args: unknown[]) => Promise<unknown>;

/** A synchronous function built at runtime — the CommonJS wrapper around a library script. */
export type SyncScriptFunction = (...args: unknown[]) => unknown;

/**
 * Build an async function from a user-provided script body. The Script action, dynamic selectors,
 * vault hooks and workflow-event conditions all route through here.
 */
export function buildAsyncScriptFunction(argNames: string[], body: string): AsyncScriptFunction {
    const asyncProto = Object.getPrototypeOf(async function () { /* probe */ }) as {
        constructor: new (...args: string[]) => AsyncScriptFunction;
    };
    const AsyncFunction = asyncProto.constructor;
    return new AsyncFunction(...argNames, body);
}

/**
 * Build a synchronous function from a user-provided body — the CommonJS wrapper
 * (`require`, `module`, `exports`) that loads a `.js` file from the user's library folder.
 *
 * A separate entry point from {@link buildAsyncScriptFunction} because a module body is executed for
 * its exports rather than awaited for a result; the same home, because it is the same capability.
 *
 * The two probes are written out rather than shared through a helper on purpose: the guardrail below
 * recognises a construction site by the `Object.getPrototypeOf(function` literal, and hiding that
 * behind a helper cost it the ability to see *any* site. Three lines of duplication are worth less
 * than a check that works.
 */
export function buildSyncScriptFunction(argNames: string[], body: string): SyncScriptFunction {
    const syncProto = Object.getPrototypeOf(function () { /* probe */ }) as {
        constructor: new (...args: string[]) => SyncScriptFunction;
    };
    const SyncFunction = syncProto.constructor;
    return new SyncFunction(...argNames, body);
}

/**
 * The two values every scripting surface binds, resolved together (#349). Sourced from the
 * {@link ObsidianApi} facade rather than the deprecated `window.app` global that user scripts used to
 * reach by accident — so plugin code honours the convention while the script keeps its escape hatch.
 */
export async function sharedScriptValues(): Promise<{ zf: ZettelFlowApp; app: App }> {
    return { zf: await fnsManager.getFns(), app: ObsidianApi.globalApp() };
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
    const app = ObsidianApi.globalApp();

    const knowledge = new ZfKnowledge(app);
    await knowledge.init();

    const ai = new ZfAi(app);
    await ai.init();

    const fns: ZettelFlowApp = {
        external: await buildExternalTools(),
        internal: await buildInternalTools(),
        knowledge: await knowledge.generate_object(),
        ai: await ai.generate_object(),
    };
    apiManifest = [...ZfVault().describe(), ...knowledge.describe(), ...ai.describe()];
    return fns;
};

/**
 * The documented shape of the built API (#350) — one description per member, produced by the same
 * `register` calls that produce the callables, so the manifest and the object cannot disagree.
 * Populated when `zf` is built; the editor and the type generator read it.
 */
let apiManifest: ApiMemberDoc[] = [];

/** The manifest of the currently built API. Empty until `fnsManager.getFns()` has resolved once. */
export function describeApi(): ApiMemberDoc[] {
    return apiManifest;
}


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
            // Do NOT cache a rejected build: if it fails (e.g. a bad scripts-folder path) we must
            // let the next call retry after the user fixes the config, instead of serving the same
            // rejected promise for the rest of the session.
            this.cache = buildTools().catch((error) => {
                this.cache = null;
                throw error;
            });
        }
        return this.cache;
    }

    public invalidateCache() {
        this.cache = null;
    }
}

export const fnsManager = FnsManager.getInstance();
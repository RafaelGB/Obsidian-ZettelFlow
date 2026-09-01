import { Plugin } from "obsidian";

/**
 * Functions and utilities from the Templater plugin
 */
export type TemplaterTools = {
    /** User-defined script functions from Templater */
    user: Record<string, unknown>;
}

/**
 * API provided by the Dataview plugin
 */
export type DataviewTools = Record<string, unknown>;

/**
 * Minimal shape of the Templater plugin instance that ZettelFlow relies on.
 *
 * Templater does not publish type definitions, so we describe only the nested
 * `user_script_functions` generator we call to expose Templater user scripts.
 */
export interface TemplaterPlugin extends Plugin {
    templater: {
        functions_generator: {
            user_functions: {
                user_script_functions: {
                    generate_object(): Promise<Record<string, unknown>>;
                };
            };
        };
    };
}

/**
 * Minimal shape of the Dataview plugin instance that ZettelFlow relies on.
 *
 * Only the public `api` surface is described; it is forwarded as-is to scripts.
 */
export interface DataviewPlugin extends Plugin {
    api: DataviewTools;
}

/**
 * External plugin tools integrated with ZettelFlow
 */
export type ZfExternalTools = {
    /** Templater plugin API (available if Templater is installed) */
    tp?: TemplaterTools;
    /** Dataview plugin API (available if Dataview is installed) */
    dv?: DataviewTools;
}

/**
 * Internal ZettelFlow APIs and utilities
 */
export type ZfInternalTools = {
    /** Vault operations for working with files and folders */
    vault: Record<string, unknown>;
    /** User-defined scripts and functions */
    user: Record<string, unknown>;
}

/**
 * The complete ZettelFlow API.
 *
 * `internal` / `external` are the original split and stay exactly as they were — every existing script
 * keeps working. The capabilities added in #350 take top-level namespaces instead, because that split
 * describes ZettelFlow's own layering rather than anything a script author cares about.
 */
export type ZettelFlowApp = {
    /** External plugin integrations */
    external: ZfExternalTools;
    /** Internal ZettelFlow functionality */
    internal: ZfInternalTools;
    /** The Knowledge State projections, with the live model already bound (#350). */
    knowledge: Record<string, unknown>;
    /** The §XII-safe path to the configured AI provider (#350). */
    ai: Record<string, unknown>;
}

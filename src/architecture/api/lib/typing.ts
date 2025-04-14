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
 * The complete ZettelFlow API
 */
export type ZettelFlowApp = {
    /** External plugin integrations */
    external: ZfExternalTools;
    /** Internal ZettelFlow functionality */
    internal: ZfInternalTools;
}


export type TemplaterTools = {
    user: Record<string, unknown>;
}

export type DataviewTools = Record<string, unknown>;

export type ZfExternalTools = {
    tp?: TemplaterTools;
    dv?: DataviewTools;
}

export type ZfInternalTools = {
    vault: Record<string, unknown>;
    user: Record<string, unknown>;
}

export type ZettelFlowApp = {
    external: ZfExternalTools;
    internal: ZfInternalTools;
}

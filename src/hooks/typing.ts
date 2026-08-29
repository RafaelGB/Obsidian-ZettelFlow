import type { TFile } from "obsidian";
import type { Literal } from "architecture/plugin";

export interface HookRequest {
    oldValue: unknown;
    newValue: unknown;
    property: string;
    frontmatter: Record<string, unknown>;
}

export interface HookResponse {
    frontmatter: Record<string, Literal>;
    removeProperties: string[];
    /** Nombre del flow (con o sin .canvas) a disparar opcionalmente. */
    flowToTrigger?: string;
}

export interface HookEvent {
    request: HookRequest;
    response: HookResponse;
    file: TFile;
}

export interface HookSettings {
    /** Código JS/TS async del usuario que muta `event` y lo devuelve. */
    script: string;
    /** Whether the hook is active (#327 S3). `undefined` = enabled (back-compat). */
    enabled?: boolean;
    /** Optional human-readable label for the settings list (#327 S3). */
    description?: string;
    /** Optional `zf` condition; the hook runs only when it holds (#327 S4). Blank = always. */
    condition?: string;
}

export type PropertiesHooksConfig = Record<string, HookSettings>;

export interface HooksConfig {
    /** Carpeta donde viven los flows disparados por hooks. */
    folderFlowPath: string;
    /** Mapa propiedad → hook. */
    properties: PropertiesHooksConfig;
}
